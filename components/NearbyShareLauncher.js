"use client";

import { useEffect, useRef, useState } from "react";

const CHUNK_SIZE = 24 * 1024;
const SIGNAL_POLL_MS = 800;

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Nearby transfer failed.");
  return data;
}

async function digest(blob) {
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function NearbyShareLauncher() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("menu");
  const [resources, setResources] = useState([]);
  const [resourceKey, setResourceKey] = useState("");
  const [sourceFile, setSourceFile] = useState(null);
  const [share, setShare] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [receivedUrl, setReceivedUrl] = useState("");
  const [receivedName, setReceivedName] = useState("");
  const peerRef = useRef(null);
  const pollerRef = useRef(null);
  const candidateKeysRef = useRef(new Set());
  const receivedRef = useRef({ chunks: [], received: 0, metadata: null });
  const remoteReadyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    api("/api/student/lectures").then((data) => {
      const next = data.lectures.flatMap((lecture) => (lecture.resources || []).map((resource) => ({
        ...resource,
        lectureId: lecture._id,
        title: lecture.title,
        chapter: lecture.chapter,
      })));
      setResources(next);
      setResourceKey((current) => current || (next[0] ? `${next[0].lectureId}:${next[0].fileId}` : ""));
    }).catch((error) => setMessage(error.message));
  }, [open]);

  useEffect(() => () => closeConnection(), []);

  function selectedResource() {
    return resources.find((item) => `${item.lectureId}:${item.fileId}` === resourceKey);
  }

  function closeConnection() {
    if (pollerRef.current) window.clearInterval(pollerRef.current);
    pollerRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    candidateKeysRef.current.clear();
    remoteReadyRef.current = false;
  }

  function closeModal() {
    closeConnection();
    if (receivedUrl) URL.revokeObjectURL(receivedUrl);
    setOpen(false);
    setMode("menu");
    setShare(null);
    setMessage("");
    setProgress(0);
    setReceivedUrl("");
    setReceivedName("");
  }

  async function sendSignal(shareCode, signalType, signal) {
    await api("/api/student/nearby-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "signal", shareCode, signalType, signal }),
    });
  }

  function addCandidate(candidate) {
    if (!candidate?.candidate || !peerRef.current) return;
    const key = JSON.stringify(candidate);
    if (candidateKeysRef.current.has(key)) return;
    candidateKeysRef.current.add(key);
    peerRef.current.addIceCandidate(candidate).catch(() => {});
  }

  function configureChannel(channel, transferShare, role) {
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 128 * 1024;
    channel.onopen = () => {
      if (role === "sender") sendFile(channel, transferShare).catch((error) => setMessage(error.message));
    };
    channel.onmessage = (event) => receiveMessage(event.data, transferShare);
    channel.onerror = () => setMessage("Transfer connection was interrupted. Try pairing again.");
    channel.onclose = () => {
      if (progress < 100) setMessage((current) => current || "Transfer connection closed.");
    };
  }

  async function createConnection(role, transferShare) {
    closeConnection();
    const connection = new RTCPeerConnection({ iceServers: [] });
    peerRef.current = connection;
    connection.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(transferShare.shareCode, "candidate", candidate).catch(() => {});
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setMessage(role === "sender" ? "Connected — sending directly to your classmate." : "Connected — receiving directly from your classmate.");
      if (["failed", "disconnected"].includes(connection.connectionState)) setMessage("Nearby connection interrupted. Pair again to retry.");
    };

    if (role === "sender") {
      const channel = connection.createDataChannel("vidya-setu-file", { ordered: true });
      configureChannel(channel, transferShare, role);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal(transferShare.shareCode, "offer", offer);
      setMessage("Waiting for your classmate to enter the code...");
    } else {
      connection.ondatachannel = ({ channel }) => configureChannel(channel, transferShare, role);
      setMessage("Connecting to sender...");
    }

    pollerRef.current = window.setInterval(() => syncSignals(role, transferShare.shareCode), SIGNAL_POLL_MS);
    await syncSignals(role, transferShare.shareCode);
  }

  async function syncSignals(role, shareCode) {
    const connection = peerRef.current;
    if (!connection) return;
    try {
      const { share: liveShare } = await api(`/api/student/nearby-shares?code=${shareCode}`);
      if (role === "sender") {
        if (liveShare.answer && !remoteReadyRef.current) {
          await connection.setRemoteDescription(liveShare.answer);
          remoteReadyRef.current = true;
        }
        if (remoteReadyRef.current) liveShare.receiverCandidates.forEach(addCandidate);
      } else {
        if (liveShare.offer && !remoteReadyRef.current) {
          await connection.setRemoteDescription(liveShare.offer);
          remoteReadyRef.current = true;
          liveShare.senderCandidates.forEach(addCandidate);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          await sendSignal(shareCode, "answer", answer);
        }
        if (remoteReadyRef.current) liveShare.senderCandidates.forEach(addCandidate);
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendFile(channel, transferShare) {
    if (!sourceFile) throw new Error("Select the downloaded file before sharing.");
    const metadata = transferShare.resource;
    channel.send(JSON.stringify({ type: "metadata", ...metadata }));
    let sent = 0;
    for (let offset = 0; offset < sourceFile.size; offset += CHUNK_SIZE) {
      while (channel.bufferedAmount > 512 * 1024) await sleep(20);
      const chunk = await sourceFile.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      channel.send(chunk);
      sent += chunk.byteLength;
      setProgress(Math.round((sent / sourceFile.size) * 100));
    }
    channel.send(JSON.stringify({ type: "complete" }));
    await api("/api/student/nearby-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", shareCode: transferShare.shareCode }) });
    setMessage("Transfer complete. Your classmate has received the file.");
  }

  async function receiveMessage(data, transferShare) {
    if (typeof data === "string") {
      const packet = JSON.parse(data);
      if (packet.type === "metadata") {
        receivedRef.current = { chunks: [], received: 0, metadata: packet };
        setMessage(`Receiving ${packet.filename}...`);
      }
      if (packet.type === "complete") await finishReceive(transferShare);
      return;
    }
    const bytes = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    receivedRef.current.chunks.push(bytes);
    receivedRef.current.received += bytes.byteLength;
    const total = receivedRef.current.metadata?.size || transferShare.resource.size || 0;
    if (total) setProgress(Math.min(99, Math.round((receivedRef.current.received / total) * 100)));
  }

  async function finishReceive(transferShare) {
    const received = receivedRef.current;
    const blob = new Blob(received.chunks, { type: received.metadata?.mimeType || transferShare.resource.mimeType });
    if (received.metadata?.checksum) {
      const actual = await digest(blob);
      if (actual !== received.metadata.checksum) {
        setMessage("File verification failed. The file was not saved.");
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    setReceivedUrl(url);
    setReceivedName(received.metadata?.filename || transferShare.resource.filename);
    setProgress(100);
    await api("/api/student/downloads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lectureId: transferShare.resource.lectureId, fileId: transferShare.resource.fileId, filename: transferShare.resource.filename, progress: 100, completed: true, bytesReceived: blob.size, totalBytes: blob.size }),
    });
    await api("/api/student/nearby-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete", shareCode: transferShare.shareCode }) });
    setMessage("Verified transfer complete. Save the file below for offline learning.");
  }

  async function startShare() {
    const resource = selectedResource();
    setMessage("");
    if (!resource || !sourceFile) return setMessage("Select the course resource and the same downloaded file.");
    if (sourceFile.size !== Number(resource.size)) return setMessage("Selected file size does not match the teacher's resource.");
    if (resource.checksum) {
      setMessage("Verifying your downloaded file...");
      if (await digest(sourceFile) !== resource.checksum) return setMessage("Selected file does not match the teacher's original resource.");
    }
    const result = await api("/api/student/nearby-shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", lectureId: resource.lectureId, fileId: resource.fileId }),
    });
    setMessage("Verifying your downloaded file...");
    if (await digest(sourceFile) !== result.share.resource.checksum) {
      await api("/api/student/nearby-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", shareCode: result.share.shareCode }) });
      return setMessage("Selected file does not match the teacher's original resource.");
    }
    setShare(result.share);
    setMode("transfer");
    await createConnection("sender", result.share);
  }

  async function joinShare() {
    if (joinCode.replace(/\D/g, "").length !== 6) return setMessage("Enter the six-digit code shown on the sender's device.");
    setMessage("");
    try {
      const result = await api("/api/student/nearby-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", shareCode: joinCode }),
      });
      setShare(result.share);
      setMode("transfer");
      await createConnection("receiver", result.share);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to join this share.");
    }
  }

  return <><button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 rounded-full bg-[#1d5148] px-4 py-3 text-sm font-bold text-white shadow-xl shadow-[#173b35]/25">Nearby share</button>{open && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#173b35]/50 p-5"><section className="w-full max-w-xl rounded-2xl bg-white p-6 text-[#173b35] shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#81918a]">Classmate transfer</p><h2 className="mt-1 text-2xl font-bold">Nearby share</h2><p className="mt-2 text-sm text-[#81918a]">Direct transfer. Keep both devices on the same Wi-Fi or hotspot.</p></div><button onClick={closeModal} className="text-2xl text-[#81918a]" aria-label="Close nearby share">×</button></div>{mode === "menu" && <div className="mt-6 grid gap-3 sm:grid-cols-2"><button onClick={() => { setMode("send"); setMessage(""); }} className="rounded-xl bg-[#1d5148] p-5 text-left text-white"><strong className="block">Share my download</strong><span className="mt-2 block text-sm text-[#c9ded5]">Send a verified video, PPT or PDF you already downloaded.</span></button><button onClick={() => { setMode("receive"); setMessage(""); }} className="rounded-xl border border-[#dfe9e1] p-5 text-left"><strong className="block">Receive from classmate</strong><span className="mt-2 block text-sm text-[#81918a]">Enter their temporary six-digit pairing code.</span></button></div>}{mode === "send" && <div className="mt-6 space-y-4"><label className="block text-sm font-bold">Course resource<select value={resourceKey} onChange={(event) => setResourceKey(event.target.value)} className="mt-2 w-full rounded-lg border border-[#d7e2dc] p-3 text-sm"><option value="">Select a resource</option>{resources.map((item) => <option key={`${item.lectureId}:${item.fileId}`} value={`${item.lectureId}:${item.fileId}`}>{item.title} — {item.filename}</option>)}</select></label><label className="block rounded-xl border border-dashed border-[#a9cdb8] p-4 text-sm font-semibold text-[#1d5148]">{sourceFile ? sourceFile.name : "Choose the same downloaded file from your device"}<input type="file" onChange={(event) => setSourceFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs" /></label><p className="text-xs text-[#81918a]">The file is checked against the teacher&apos;s original checksum before sharing.</p><button onClick={startShare} className="w-full rounded-xl bg-[#1d5148] px-4 py-3 text-sm font-bold text-white">Create pairing code</button></div>}{mode === "receive" && <div className="mt-6"><label className="block text-sm font-bold">Six-digit code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength="6" placeholder="123456" className="mt-2 w-full rounded-lg border border-[#d7e2dc] p-3 text-center text-xl font-bold tracking-[0.35em]" /></label><button onClick={joinShare} className="mt-4 w-full rounded-xl bg-[#1d5148] px-4 py-3 text-sm font-bold text-white">Connect securely</button></div>}{mode === "transfer" && <div className="mt-6 rounded-xl bg-[#f4f7f2] p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#81918a]">Pairing code</p><p className="mt-2 text-4xl font-bold tracking-[0.3em] text-[#1d5148]">{share?.shareCode}</p><p className="mt-4 text-sm text-[#61756b]">{share?.resource.filename}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dfe9e1]"><div className="h-full rounded-full bg-[#f0bd4c] transition-all" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-right text-xs font-bold text-[#1d5148]">{progress}%</p>{receivedUrl && <a href={receivedUrl} download={receivedName} className="mt-4 block rounded-lg bg-[#1d5148] px-4 py-3 text-center text-sm font-bold text-white">Save {receivedName}</a>}</div>}{message && <p className="mt-4 rounded-xl bg-[#fff6df] px-4 py-3 text-sm font-semibold text-[#806528]">{message}</p>}{mode !== "menu" && mode !== "transfer" && <button onClick={() => { setMode("menu"); setMessage(""); }} className="mt-5 text-sm font-bold text-[#1d5148]">← Back</button>}</section></div>}</>;
}
