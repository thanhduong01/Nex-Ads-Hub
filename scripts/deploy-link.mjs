// Prints a Vercel Deploy URL after this source is pushed to your Git provider.
const source = process.argv[2];
if (!source) {
  console.error('Dùng: npm run deploy:link -- https://github.com/OWNER/REPO');
  process.exit(1);
}
const repository = new URL(source);
if (
  repository.protocol !== 'https:' ||
  !['github.com', 'gitlab.com', 'bitbucket.org'].includes(repository.hostname)
) {
  throw new Error('Cần URL HTTPS repository GitHub, GitLab hoặc Bitbucket của bạn.');
}
const url = new URL('https://vercel.com/new/clone');
url.searchParams.set('repository-url', repository.toString());
url.searchParams.set('project-name', 'ads-hub');
url.searchParams.set('repository-name', 'ads-hub');
url.searchParams.set(
  'env',
  [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_EMAIL',
    'META_ACCESS_TOKEN',
    'META_API_VERSION',
    'CRON_SECRET',
    'NEXT_PUBLIC_SITE_URL',
  ].join(','),
);
url.searchParams.set(
  'envDescription',
  'Cấu hình Supabase, Meta và domain của bạn theo README. Cron 30 phút cần Vercel Pro.',
);
console.log(url.toString());
