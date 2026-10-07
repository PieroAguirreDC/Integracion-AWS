variable "project" {
  description = "Nombre del proyecto, se usa como prefijo de todos los recursos."
  type        = string
  default     = "image-processor"
}

variable "env" {
  description = "Entorno de despliegue."
  type        = string

  validation {
    condition     = contains(["dev", "qa", "prod"], var.env)
    error_message = "env debe ser dev, qa o prod."
  }
}

variable "aws_region" {
  description = "Región de AWS."
  type        = string
  default     = "us-east-1"
}

variable "log_retention_days" {
  description = "Días de retención de los log groups de CloudWatch."
  type        = number
  default     = 14
}

variable "upload_lambda_zip" {
  description = "Ruta al zip de upload-lambda generado por scripts/build.sh."
  type        = string
  default     = "build/upload-lambda.zip"
}

variable "crop_lambda_zip" {
  description = "Ruta al zip de crop-lambda generado por scripts/build.sh."
  type        = string
  default     = "build/crop-lambda.zip"
}