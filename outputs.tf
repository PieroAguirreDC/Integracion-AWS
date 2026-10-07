output "api_url" {
  description = "URL base de la API (stage $default)."
  value       = module.upload_api.api_url
}

output "upload_url" {
  description = "URL completa para subir imágenes (POST)."
  value       = "${trimsuffix(module.upload_api.api_url, "/")}/upload"
}

output "bucket_name" {
  description = "Bucket donde quedan uploads/ y processed/."
  value       = module.storage.bucket_name
}

output "queue_url" {
  description = "URL de la cola principal."
  value       = module.queue.queue_url
}

output "crop_function_name" {
  description = "Nombre de la crop-lambda (para ver sus logs)."
  value       = module.crop_worker.function_name
}
