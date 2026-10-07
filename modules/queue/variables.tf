variable "project" {
  description = "Nombre del proyecto."
  type        = string
}

variable "env" {
  description = "Entorno: dev, qa o prod."
  type        = string
}

variable "bucket_name" {
  description = "Bucket que envía las notificaciones ObjectCreated."
  type        = string
}

variable "bucket_arn" {
  description = "ARN del bucket (para la queue policy)."
  type        = string
}
