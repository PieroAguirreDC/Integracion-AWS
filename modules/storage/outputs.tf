output "bucket_name" {
  description = "Nombre del bucket de imágenes."
  value       = aws_s3_bucket.images.bucket
}

output "bucket_arn" {
  description = "ARN del bucket de imágenes."
  value       = aws_s3_bucket.images.arn
}
