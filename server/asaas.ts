const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_PROD_URL = "https://api.asaas.com/v3";

const FALLBACK_TEST_CPF = "24971563792";

function getBaseUrl(): string {
  return process.env.ASAAS_ENV === "production" ? ASAAS_PROD_URL : ASAAS_SANDBOX_URL;
}

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) {
    throw new Error("ASAAS_API_KEY não configurada");
  }
  return key;
}

async function asaasFetch(path: string, init: RequestInit = {}): Promise<any> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: getApiKey(),
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const errMsg =
      data?.errors?.[0]?.description ||
      data?.message ||
      data?.raw ||
      `Asaas ${res.status}`;
    throw new Error(`Asaas: ${errMsg}`);
  }

  return data;
}

export interface AsaasCustomerInput {
  name: string;
  email?: string | null;
  cpfCnpj?: string | null;
  phone?: string | null;
}

export async function findOrCreateCustomer(input: AsaasCustomerInput): Promise<string> {
  const cpf = (input.cpfCnpj || "").replace(/\D/g, "") || FALLBACK_TEST_CPF;

  const search = await asaasFetch(`/customers?cpfCnpj=${encodeURIComponent(cpf)}`);
  if (search?.data && search.data.length > 0) {
    return search.data[0].id;
  }

  if (input.email) {
    const byEmail = await asaasFetch(`/customers?email=${encodeURIComponent(input.email)}`);
    if (byEmail?.data && byEmail.data.length > 0) {
      return byEmail.data[0].id;
    }
  }

  const created = await asaasFetch(`/customers`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email || undefined,
      cpfCnpj: cpf,
      mobilePhone: normalizeBrazilianMobile(input.phone),
    }),
  });
  return created.id;
}

function normalizeBrazilianMobile(phone?: string | null): string | undefined {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, "");
  // Strip Brazilian country code if present
  if (digits.length === 13 && digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("55")) digits = digits.slice(2);
  // Valid Brazilian mobile: 11 digits (DDD + 9 + number) or 10 (DDD + landline)
  if (digits.length === 10 || digits.length === 11) return digits;
  return undefined;
}

export interface AsaasPixChargeInput {
  customerId: string;
  value: number;
  dueDate: string;
  description: string;
  externalReference?: string;
}

export interface AsaasPixResult {
  chargeId: string;
  pixCode: string;
  qrCodeImage: string;
  expirationDate: string | null;
  invoiceUrl: string | null;
}

export async function createPixCharge(input: AsaasPixChargeInput): Promise<AsaasPixResult> {
  const payment = await asaasFetch(`/payments`, {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: "PIX",
      value: Number(input.value.toFixed(2)),
      dueDate: input.dueDate,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });

  const pix = await asaasFetch(`/payments/${payment.id}/pixQrCode`);

  return {
    chargeId: payment.id,
    pixCode: pix.payload || "",
    qrCodeImage: pix.encodedImage || "",
    expirationDate: pix.expirationDate || null,
    invoiceUrl: payment.invoiceUrl || null,
  };
}

export async function getPixForCharge(chargeId: string): Promise<(AsaasPixResult & { value: number; status: string }) | null> {
  try {
    const payment = await asaasFetch(`/payments/${chargeId}`);
    if (!payment) return null;
    const pix = await asaasFetch(`/payments/${chargeId}/pixQrCode`);
    return {
      chargeId,
      pixCode: pix.payload || "",
      qrCodeImage: pix.encodedImage || "",
      expirationDate: pix.expirationDate || null,
      invoiceUrl: payment.invoiceUrl || null,
      value: Number(payment.value || 0),
      status: payment.status || "",
    };
  } catch {
    return null;
  }
}

export function isAsaasConfigured(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}
