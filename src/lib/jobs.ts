export type JobKind = 'convert' | 'transcribe';
export type JobStatus = 'queued' | 'processing' | 'done' | 'error';

export type JobRecord = {
  id: string;
  kind: JobKind;
  filename: string;
  file_size: number;
  output_format: string | null;
  status: JobStatus;
  output_url: string | null;
  transcript: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateJobInput = {
  kind: JobKind;
  filename: string;
  fileSize: number;
  outputFormat?: string | null;
};

export type UpdateJobInput = {
  status?: JobStatus;
  outputUrl?: string | null;
  transcript?: string | null;
  errorMessage?: string | null;
  outputFormat?: string | null;
};

export async function createJob(input: CreateJobInput): Promise<JobRecord> {
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function updateJob(jobId: string, input: UpdateJobInput): Promise<JobRecord> {
  const response = await fetch(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function listJobs(limit = 10): Promise<JobRecord[]> {
  const response = await fetch(`/api/jobs?limit=${limit}`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
