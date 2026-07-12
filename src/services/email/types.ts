export interface EmailMessage {
  to: string
  template: string
  data: Record<string, unknown>
}
export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage): Promise<{ id: string }>
}
