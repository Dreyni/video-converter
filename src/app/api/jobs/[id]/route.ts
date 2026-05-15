import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { JobStatus } from '@/lib/jobs';

const VALID_STATUSES: JobStatus[] = ['queued', 'processing', 'done', 'error'];

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to load job.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      const status = String(body.status) as JobStatus;
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: 'Invalid job status.' }, { status: 400 });
      }
      updates.status = status;
    }

    if (body.outputUrl !== undefined) {
      updates.output_url = body.outputUrl ? String(body.outputUrl) : null;
    }

    if (body.transcript !== undefined) {
      updates.transcript = body.transcript ? String(body.transcript) : null;
    }

    if (body.errorMessage !== undefined) {
      updates.error_message = body.errorMessage ? String(body.errorMessage) : null;
    }

    if (body.outputFormat !== undefined) {
      updates.output_format = body.outputFormat ? String(body.outputFormat) : null;
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update job.' }, { status: 500 });
  }
}
