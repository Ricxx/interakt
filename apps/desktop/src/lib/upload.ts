// Upload an image to the API (proxied to object storage); returns the in-app URL to reference it.
export async function uploadImage(file: File): Promise<{ key: string; url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", credentials: "include", body: fd });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "upload_failed");
  return res.json();
}
