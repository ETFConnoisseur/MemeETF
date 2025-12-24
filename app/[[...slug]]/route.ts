import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Don't serve Vite app for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  try {
    // Read the Vite-built index.html
    const viteBuildPath = join(process.cwd(), 'public', 'vite-build', 'index.html');
    const html = readFileSync(viteBuildPath, 'utf-8');
    
    // Vite outputs assets at /assets/ but they're actually at /vite-build/assets/
    // Also need to handle the base path for API calls
    const modifiedHtml = html
      .replace(/src="\/assets\//g, 'src="/vite-build/assets/')
      .replace(/href="\/assets\//g, 'href="/vite-build/assets/')
      .replace(/src='\/assets\//g, "src='/vite-build/assets/")
      .replace(/href='\/assets\//g, "href='/vite-build/assets/");
    
    return new NextResponse(modifiedHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error serving Vite app:', error);
    return new NextResponse('Vite app not found. Please rebuild the Vite app.', { 
      status: 404,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}

