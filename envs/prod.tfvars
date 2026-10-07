# Reemplazar 723300665555 por el id de la cuenta AWS (sale en el output de tfstate-backend/).
bucket       = "image-processor-tfstate-723300665555"
key          = "image-processor/prod/terraform.tfstate"
region       = "us-east-1"
encrypt      = true
use_lockfile = true
