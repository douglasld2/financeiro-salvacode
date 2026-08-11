const META_API_VERSION = "v19.0";
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

function getConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error(
      "WhatsApp não configurado. Configure WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID."
    );
  }

  return { token, phoneNumberId };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function normalizeTo(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (!digits.startsWith("55")) {
    digits = "55" + digits;
  }
  return digits;
}

export async function sendWhatsAppText(to: string, message: string): Promise<void> {
  const { token, phoneNumberId } = getConfig();
  const toNumber = normalizeTo(to);

  const url = `${META_BASE_URL}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: toNumber,
    type: "text",
    text: { body: message },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;

  if (!res.ok) {
    const errMsg =
      data?.error?.message ||
      data?.error?.error_data?.details ||
      `WhatsApp API ${res.status}`;
    throw new Error(`WhatsApp: ${errMsg}`);
  }
}
