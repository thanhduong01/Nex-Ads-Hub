import Head from 'next/head';
import App from '../components/App.jsx';
export default function Home() {
  return (
    <>
      <Head>
        <title>Ads Hub — Không gian làm việc của Media Buyer</title>
        <meta
          name="description"
          content="Quản lý Facebook Ads, phân tích hiệu suất và báo cáo khách hàng trong một workspace riêng."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0d1118" />
      </Head>
      <App />
    </>
  );
}
