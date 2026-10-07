#1.cloudWatch log group
resource "aws_cloudwatch_log_group" "crop_log_group" {
  name              = "/aws/lambda/${var.project}-${var.env}-crop"
  retention_in_days = var.log_retention_days
}

#2.IAM role para la lambda
resource "aws_iam_role" "crop_role" {
  name = "${var.project}-${var.env}-crop-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

#2.1.permisos básicos de ejecución
resource "aws_iam_role_policy_attachment" "crop_basic_execution" {
  role       = aws_iam_role.crop_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

#2.2.política inline para S3 y SQS
resource "aws_iam_role_policy" "crop_permissions" {
  name = "${var.project}-${var.env}-crop-permissions"
  role = aws_iam_role.crop_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "${var.bucket_arn}/uploads/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${var.bucket_arn}/processed/*"
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = var.queue_arn
      }
    ]
  })
}

#3.lambda function
resource "aws_lambda_function" "crop" {
  function_name    = "${var.project}-${var.env}-crop"
  role             = aws_iam_role.crop_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  memory_size      = 512
  timeout          = 60
  filename         = var.lambda_zip
  source_code_hash = filebase64sha256(var.lambda_zip)

  environment {
    variables = {
      S3_BUCKET        = var.bucket_name
      PROCESSED_PREFIX = "processed/"
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.crop_log_group,
    aws_iam_role_policy_attachment.crop_basic_execution,
    aws_iam_role_policy.crop_permissions
  ]
}

#4.SQS event source mapping
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn        = var.queue_arn
  function_name           = aws_lambda_function.crop.arn
  batch_size              = 5
  enabled                 = true
  function_response_types = ["ReportBatchItemFailures"]
}