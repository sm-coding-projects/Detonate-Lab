import type { Job, Report, SampleCard } from './types';

const BASE = '/api';

type ApiError = { error?: { code?: string; message?: string } };

async function asJson<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const e = body as ApiError | null;
    const msg = e?.error?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return body as T;
}

export async function getSamples(): Promise<SampleCard[]> {
  const res = await fetch(`${BASE}/samples`);
  const data = await asJson<{ samples: SampleCard[] }>(res);
  return data.samples;
}

export type SubmitResult = { jobId: string; sampleId: string };

export async function submitFile(file: File): Promise<SubmitResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/samples`, { method: 'POST', body: form });
  return asJson<SubmitResult>(res);
}

export async function submitUrl(url: string): Promise<SubmitResult> {
  const res = await fetch(`${BASE}/samples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return asJson<SubmitResult>(res);
}

export async function submitSample(sampleId: string): Promise<SubmitResult> {
  const res = await fetch(`${BASE}/samples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleId }),
  });
  return asJson<SubmitResult>(res);
}

export async function getJob(id: string): Promise<Job> {
  const res = await fetch(`${BASE}/jobs/${encodeURIComponent(id)}`);
  return asJson<Job>(res);
}

export async function getReport(id: string): Promise<Report> {
  const res = await fetch(`${BASE}/reports/${encodeURIComponent(id)}`);
  const data = await asJson<{ report: Report }>(res);
  return data.report;
}
