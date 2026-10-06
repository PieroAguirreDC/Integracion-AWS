output "api_url" {
  description = "URL base de la HTTP API."
  value       = aws_apigatewayv2_stage.default.invoke_url
}
