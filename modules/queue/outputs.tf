output "queue_arn" {
  description = "ARN de la cola principal."
  value       = aws_sqs_queue.main.arn
}

output "queue_url" {
  description = "URL de la cola principal."
  value       = aws_sqs_queue.main.url
}

output "dlq_arn" {
  description = "ARN de la Dead-Letter Queue."
  value       = aws_sqs_queue.dlq.arn
}
