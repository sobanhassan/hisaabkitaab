import { createClient } from "npm:@supabase/supabase-js@2";
import { decodeProtectedHeader, importX509, jwtVerify } from "npm:jose@5";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const FIREBASE_CERTIFICATES_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cachedCertificates: Record<string, string> = {};
let certificatesExpireAt = 0;

async function getFirebaseCertificate(keyId: string) {
  if (Date.now() >= certificatesExpireAt || !cachedCertificates[keyId]) {
    const response = await fetch(FIREBASE_CERTIFICATES_URL);
    if (!response.ok) throw new Error("Unable to load Firebase signing certificates.");
    cachedCertificates = await response.json();
    const cacheControl = response.headers.get("cache-control") || "";
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
    certificatesExpireAt = Date.now() + maxAge * 1000;
  }
  if (!cachedCertificates[keyId]) throw new Error("Unknown Firebase signing certificate.");
  return importX509(cachedCertificates[keyId], "RS256");
}

async function verifyFirebaseToken(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID");
  if (!token || !projectId) throw new Error("Missing authentication configuration.");
  const header = decodeProtectedHeader(token);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Invalid Firebase token.");
  const key = await getFirebaseCertificate(header.kid);
  const { payload } = await jwtVerify(token, key, {
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  if (!payload.sub) throw new Error("Invalid Firebase user.");
  return payload.sub;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = await verifyFirebaseToken(request);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is missing.");

    const storage = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    }).storage.from("profile-photos");
    const path = `${userId}/avatar`;

    if (request.method === "DELETE") {
      const { error } = await storage.remove([path]);
      if (error) throw error;
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed." }, { status: 405, headers: corsHeaders });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > MAX_IMAGE_SIZE) {
      return Response.json({ error: "Use an image smaller than 5 MB." }, { status: 400, headers: corsHeaders });
    }

    const { error } = await storage.upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
    if (error) throw error;
    const { data } = storage.getPublicUrl(path);
    return Response.json({ url: `${data.publicUrl}?v=${Date.now()}` }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: error.message || "Profile photo request failed." }, { status: 401, headers: corsHeaders });
  }
});
