# Módulo raíz: solo une los módulos. Cada módulo tiene un dueño.

# Piero: bucket S3 con prefijos uploads/ y processed/
module "storage" {
  source = "./modules/storage"

  project = var.project
  env     = var.env
}

# Piero: cola SQS, DLQ, notificación S3 -> SQS y alarma de la DLQ
module "queue" {
  source = "./modules/queue"

  project     = var.project
  env         = var.env
  bucket_name = module.storage.bucket_name
  bucket_arn  = module.storage.bucket_arn
}

# Fabrizio: API Gateway + upload-lambda
module "upload_api" {
  source = "./modules/upload_api"

  project            = var.project
  env                = var.env
  bucket_name        = module.storage.bucket_name
  bucket_arn         = module.storage.bucket_arn
  lambda_zip         = var.upload_lambda_zip
  log_retention_days = var.log_retention_days
}

# Joaquín: crop-lambda + trigger desde SQS
module "crop_worker" {
  source = "./modules/crop_worker"

  project            = var.project
  env                = var.env
  bucket_name        = module.storage.bucket_name
  bucket_arn         = module.storage.bucket_arn
  queue_arn          = module.queue.queue_arn
  lambda_zip         = var.crop_lambda_zip
  log_retention_days = var.log_retention_days
}
