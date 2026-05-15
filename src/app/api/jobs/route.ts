import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { JobKind } from '@/lib/jobs';

const VALID_KINDS: JobKind[] = ['convert', 'transcribe'];

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitParam ?? '10') || 10, 1), 50);

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to list jobs.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const body = await request.json();

    const kind = body.kind as JobKind;
    const filename = String(body.filename ?? '').trim();
    const fileSize = Number(body.fileSize ?? body.file_size ?? 0);
    const outputFormat = body.outputFormat ? String(body.outputFormat).trim() : null;

    if (!VALID_KINDS.includes(kind) || !filename || !Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ error: 'Invalid job payload.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert({
        kind,
        filename,
        file_size: fileSize,
        output_format: outputFormat,
        status: 'queued',
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create job.' }, { status: 500 });
  }
}
