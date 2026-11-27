export type DriveMediaCategory =
  | 'PROFILE'
  | 'KTP'
  | 'KK'
  | 'CLOCK_IN'
  | 'CLOCK_OUT'
  | 'TODO_PHOTO'
  | 'TODO_DOC';

export interface DriveUploadParams {
  category: DriveMediaCategory;
  fileName: string;
  base64Data: string;
  mimeType?: string;
  uid?: string;
  refTab?: string;
  refId?: string;
  monthKey?: string;
  replaceFileId?: string | null;
}

export interface DriveUploadResult {
  ok: true;
  fileId: string;
  fileName: string;
  mimeType: string;
  folderPath: string;
  imageUrl: string;
  thumbnailUrl: string;
  viewUrl: string;
}

const DRIVE_WEBAPP_URL = (import.meta.env.VITE_DRIVE_WEBAPP_URL ?? '').trim();
const DRIVE_API_KEY = (import.meta.env.VITE_DRIVE_API_KEY ?? '').trim();

export function isDriveStorageConfigured(): boolean {
  return DRIVE_WEBAPP_URL.length > 0;
}

export function isDriveUrl(value: string): boolean {
  return (
    value.startsWith('https://drive.google.com/') ||
    value.startsWith('https://lh3.googleusercontent.com/')
  );
}

export function extractDriveFileId(urlOrId: string | undefined | null): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  if (!trimmed) return null;
  const lh3 = trimmed.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3) return lh3[1];
  const fileView = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileView) return fileView[1];
  const thumb = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (thumb) return thumb[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function uploadToGoogleDrive(params: DriveUploadParams): Promise<DriveUploadResult> {
  if (!DRIVE_WEBAPP_URL) {
    throw new Error('VITE_DRIVE_WEBAPP_URL belum dikonfigurasi.');
  }

  const response = await fetch(DRIVE_WEBAPP_URL, {
    method: 'POST',
    // Gunakan text/plain agar browser/WebView tidak mengirim CORS preflight OPTIONS ke Apps Script
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      action: 'upload',
      apiKey: DRIVE_API_KEY || undefined,
      ...params,
    }),
  });

  if (!response.ok) {
    throw new Error(`Gagal mengunggah ke Google Drive (HTTP ${response.status}).`);
  }

  const data = (await response.json()) as Partial<DriveUploadResult> & {
    ok?: boolean;
    error?: string;
  };
  if (!data.ok || !data.fileId || !data.imageUrl || !data.viewUrl) {
    throw new Error(data.error || 'Respons Google Drive Web App tidak valid.');
  }
  return data as DriveUploadResult;
}

export async function deleteFromGoogleDrive(urlOrId: string | undefined | null): Promise<void> {
  if (!DRIVE_WEBAPP_URL) return;
  const fileId = extractDriveFileId(urlOrId);
  if (!fileId) return;

  try {
    await fetch(DRIVE_WEBAPP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify({
        action: 'delete',
        apiKey: DRIVE_API_KEY || undefined,
        fileId,
      }),
    });
  } catch {
    // Best-effort cleanup in Drive
  }
}
