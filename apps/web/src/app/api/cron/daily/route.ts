import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }

  const authHeader = request.headers.get('authorization') || '';
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  const apiUrl = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL;
  const jobSecret = process.env.JOB_SECRET;

  if (!apiUrl || !jobSecret) {
    return NextResponse.json(
      { ok: false, message: 'Missing API_INTERNAL_URL or JOB_SECRET' },
      { status: 500 }
    );
  }

  const response = await fetch(`${apiUrl}/internal/jobs/run-daily`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-job-secret': jobSecret
    },
    cache: 'no-store'
  });

  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') || 'application/json'
    }
  });
}
