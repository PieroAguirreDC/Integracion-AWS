variable "project" {
  description = "Nombre del proyecto, se usa como prefijo de todos los recursos."
  type        = string
}

variable "env" {
  description = "Entorno de despliegue."
  type        = string
}

variable "bucket_name" {
  description = "Nombre del bucket S3 de destino."
  type        = string
}

variable "bucket_arn" {
  description = "ARN del bucket S3 de destino."
  type        = string
}

variable "lambda_zip" {
  description = "Ruta al zip de upload-lambda generado por scripts/build.sh."
  type        = string
}

variable "log_retention_days" {
  description = "Días de retención de los log groups de CloudWatch."
  type        = number
}
