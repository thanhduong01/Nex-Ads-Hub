import { useEffect } from 'react';
export default function Home(){
  useEffect(()=>{ window.location.href='/dashboard.html'; },[]);
  return <div style={{padding:40, fontFamily:'sans-serif'}}>Đang chuyển tới Dashboard... <a href="/dashboard.html">Bấm vào đây nếu không tự chuyển</a></div>;
}