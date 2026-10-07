resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project}-${var.env}-image-dlq"
  message_retention_seconds = 1209600 # 14 días
}

resource "aws_sqs_queue" "main" {
  name                       = "${var.project}-${var.env}-image-queue"
  visibility_timeout_seconds = 360   # 6 x timeout de crop-lambda (60 s)
  message_retention_seconds  = 86400 # 1 día
  receive_wait_time_seconds  = 20    # long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3
  })
}

# Permite que S3 (solo este bucket) envíe mensajes a la cola
data "aws_iam_policy_document" "allow_s3" {
  statement {
    sid       = "AllowS3SendMessage"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.main.arn]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [var.bucket_arn]
    }
  }
}

resource "aws_sqs_queue_policy" "main" {
  queue_url = aws_sqs_queue.main.id
  policy    = data.aws_iam_policy_document.allow_s3.json
}

# Solo lo que entra a uploads/ dispara el procesamiento (evita bucle con processed/)
resource "aws_s3_bucket_notification" "uploads" {
  bucket = var.bucket_name

  queue {
    queue_arn     = aws_sqs_queue.main.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "uploads/"
  }

  depends_on = [aws_sqs_queue_policy.main]
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${var.project}-${var.env}-dlq-messages-alarm"
  alarm_description   = "Hay imágenes que fallaron 3 veces y quedaron en la DLQ."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }
}
