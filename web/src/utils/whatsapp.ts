/** Deep link to WhatsApp with a pre-filled first-contact message, so staff never start from a blank chat. */
export function buildWhatsAppLink(phone: string, parentName: string, sourceChannel: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const message =
    `Hi ${parentName}, greetings from Little Millennium Singanallur! ` +
    `We received your enquiry via ${sourceChannel} and would love to know a little more about your requirements ` +
    `so we can help you with the admission process. Could you share a few details with us?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
