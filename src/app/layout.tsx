import './design-system.css';
import type { Metadata } from 'next';
import PwaRegister from './pwa-register';
export const metadata:Metadata={title:'Devrefract Outreach',description:'A private workspace for finding, starting, and closing the right customer conversations.',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,statusBarStyle:'black-translucent',title:'Devrefract'},icons:{apple:'/icons/apple-touch-icon.png'}};
export const viewport={themeColor:[{media:'(prefers-color-scheme: light)',color:'#fafafa'},{media:'(prefers-color-scheme: dark)',color:'#111313'}],width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-PT"><body>{children}<PwaRegister/></body></html>}
