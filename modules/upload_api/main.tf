
data "aws_iam_policy_document" "upload_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "upload_lambda_role" {
  name               = "${var.project}-${var.env}-upload-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.upload_assume_role.json
}

resource "aws_iam_role_policy_attachment" "upload_basic_execution" {
  role       = aws_iam_role.upload_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "upload_s3_put" {
  name = "${var.project}-${var.env}-upload-s3"
  role = aws_iam_role.upload_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AllowPutUploads"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${var.bucket_arn}/uploads/*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "upload_lambda" {
  name              = "/aws/lambda/${var.project}-${var.env}-upload"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "upload" {
  function_name = "${var.project}-${var.env}-upload"
  role          = aws_iam_role.upload_lambda_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  memory_size   = 256
  timeout       = 30

  filename         = var.lambda_zip
  source_code_hash = filebase64sha256(var.lambda_zip)

  environment {
    variables = {
      S3_BUCKET     = var.bucket_name
      UPLOAD_PREFIX = "uploads/"
    }
  }

  depends_on = [aws_cloudwatch_log_group.upload_lambda]
}
