import { execFile } from 'child_process';

// El wa-bridge (Baileys) corre en lukeserver y no expone su puerto públicamente —
// esta máquina le habla por SSH (alias configurado en ~/.ssh/config), igual que
// como se administra manualmente. Si el server no está alcanzable, las funciones
// devuelven null en vez de lanzar, para que la UI pueda mostrar "no disponible".

function sshCurl(path: string): Promise<string | null> {
  const sshHost = process.env.WA_BRIDGE_SSH_HOST;
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  if (!sshHost || !bridgeUrl) return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile(
      'ssh',
      ['-o', 'ConnectTimeout=8', sshHost, `curl -s --max-time 6 ${bridgeUrl}${path}`],
      { timeout: 12000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(stdout);
      }
    );
  });
}

// POST con body JSON enviado por stdin (nunca interpolado en el comando) — así el
// contenido (texto del mensaje, número) no puede romper ni inyectar el comando SSH.
function sshCurlPost(path: string, body: unknown): Promise<string | null> {
  const sshHost = process.env.WA_BRIDGE_SSH_HOST;
  const bridgeUrl = process.env.WA_BRIDGE_URL;
  if (!sshHost || !bridgeUrl) return Promise.resolve(null);

  return new Promise((resolve) => {
    const child = execFile(
      'ssh',
      ['-o', 'ConnectTimeout=8', sshHost, `curl -s --max-time 8 -X POST -H "Content-Type: application/json" --data-binary @- ${bridgeUrl}${path}`],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(stdout);
      }
    );
    child.stdin?.write(JSON.stringify(body));
    child.stdin?.end();
  });
}

export async function fetchBridgeStatus(): Promise<{ status: string; service?: string; botNumber?: string | null } | null> {
  const raw = await sshCurl('/status');
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    return { status: json.status, service: json.service, botNumber: json.botNumber ?? null };
  } catch {
    return null;
  }
}

export async function sendBridgeMessage(to: string, text: string): Promise<boolean> {
  const raw = await sshCurlPost('/send', { to, text });
  if (!raw) return false;
  try {
    return JSON.parse(raw).success === true;
  } catch {
    return false;
  }
}

// 'composing' = "escribiendo…", 'recording' = "grabando audio…", 'paused' = lo apaga.
export async function sendBridgePresence(to: string, state: 'composing' | 'recording' | 'paused'): Promise<boolean> {
  const raw = await sshCurlPost('/presence', { to, state });
  if (!raw) return false;
  try {
    return JSON.parse(raw).success === true;
  } catch {
    return false;
  }
}

export async function fetchBridgeQr(): Promise<string | null> {
  const raw = await sshCurl('/qr');
  if (!raw) return null;
  try {
    const json = JSON.parse(raw);
    return json.qr ?? null;
  } catch {
    return null;
  }
}
