"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Handshake, LineChart, Package, Plus, Scale, ShieldCheck, Sprout, Warehouse, Wheat, ChevronRight, Search, TrendingUp, Store, Truck, CircleDollarSign, Sparkles, BadgeCheck, Users, MapPinned } from "lucide-react";
import { CropSticker } from "@/components/crops/CropSticker";
import Link from "next/link";
import Image from "next/image";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Card } from "@/components/ui/primitives";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useFarmerProfileQuery } from "@/hooks/useFarmerProfile";
import { ProfileCompletionCard } from "@/components/farmer-profile/ProfileCompletionCard";
import { ROLE_LABEL } from "@/components/nav/navConfig";
import { PageHeader, StatCard } from "@/components/ui/stat-card";
import { ApiRequestError } from "@/types/api";
import { lotApi } from "@/services/lotApi";
import { tradeOfferApi } from "@/services/tradeApi";

// NOTE: these tiles used to hotlink photos straight from commons.wikimedia.org.
// That works on an open home/dev connection, but many production hosts, office
// and campus networks block or throttle third-party domains they don't control,
// so the images silently fail to load once deployed even though the rest of the
// app works fine. Using a local icon + gradient tile removes that external
// dependency entirely, so the dashboard looks the same everywhere, with zero
// network risk.
const TILE_STYLE: Record<string,string> = {
 crop: "bg-gradient-to-br from-[#eaf3df] to-[#cfe3b7] text-[#3f5d24]",
 crops: "bg-gradient-to-br from-[#fdeecb] to-[#f3d68f] text-[#7a5a10]",
 market: "bg-gradient-to-br from-[#e4ecf7] to-[#bcd0ec] text-[#274a7a]",
 sell: "bg-gradient-to-br from-[#171714] to-[#3a382f] text-[#e1bd4f]",
};

const ACTIONS=[
 {title:"My Farms",description:"See your farms and fields.",href:"/farms",icon:<Sprout/>,kind:"crop"},
 {title:"My Crops",description:"Manage the crops you are growing.",href:"/crops",icon:<Wheat/>,kind:"crops"},
 {title:"Market",description:"See today's local market prices.",href:"/market",icon:<Store/>,kind:"market"},
 {title:"Sell Produce",description:"List your crop for buyers.",href:"/lots/new",icon:<Package/>,kind:"sell"},
];

const SALE_CARDS=[
 {title:"Sell your produce today",description:"List a lot in under two minutes and reach buyers directly.",cta:"Sell now",href:"/lots/new",bg:"bg-[#171714]",text:"text-white",sub:"text-[#c9c4b4]",btn:"bg-[#e1bd4f] text-[#171714]",icon:<Package/>,iconBg:"bg-white/10 text-[#e1bd4f]"},
 {title:"Check today's mandi price",description:"Compare rates across nearby markets before you decide.",cta:"Open market",href:"/market",bg:"bg-[#e1bd4f]",text:"text-[#171714]",sub:"text-[#5a4a1c]",btn:"bg-[#171714] text-white",icon:<LineChart/>,iconBg:"bg-black/10 text-[#171714]"},
 {title:"Grow with your FPO",description:"Aggregate produce with other farmers for a better price.",cta:"View FPO",href:"/fpo-membership",bg:"bg-[#faf8f3] border border-[#e4ddd2]",text:"text-[#171714]",sub:"text-[#77776f]",btn:"bg-[#171714] text-white",icon:<Handshake/>,iconBg:"bg-[#171714]/5 text-[#171714]"},
];

function DashboardStats(){
 const lots=useQuery({queryKey:["lots","mine"],queryFn:()=>lotApi.listMine(),staleTime:300_000});
 const offers=useQuery({queryKey:["trade-offers","mine"],queryFn:()=>tradeOfferApi.list(),staleTime:300_000});
 const active=lots.data?.filter((x)=>x.status!=="CANCELLED"&&x.status!=="COMPLETED").length;
 const pending=offers.data?.filter((x)=>x.status==="PENDING"||x.status==="COUNTERED").length;
 return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
  <StatCard label="Active produce" value={active ?? "—"} hint="Lots currently moving" icon={<Package className="h-4 w-4"/>} href="/lots" />
  <StatCard label="Offers to review" value={pending ?? "—"} hint="Need your attention" icon={<Handshake className="h-4 w-4"/>} href="/trade-offers" tone="accent" />
  <StatCard label="All produce lots" value={lots.data?.length ?? "—"} hint="Your listed produce" icon={<Wheat className="h-4 w-4"/>} href="/lots" />
  <StatCard label="Market prices" dataTour="market" value="Check" hint="See today's rates" icon={<LineChart className="h-4 w-4"/>} href="/market" />
 </div>;
}

function RecentProduce(){
 const q=useQuery({queryKey:["lots","mine"],queryFn:()=>lotApi.listMine(),staleTime:300_000});
 if(q.isLoading)return <LoadingBlock/>;
 if(q.isError)return <ErrorBlock message="Could not load your produce." onRetry={()=>q.refetch()}/>;
 const lots=(q.data??[]).slice(0,5);
 return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="section-title">Your produce</h2><p className="text-xs text-muted-foreground mt-1">Recent lots and their current status.</p></div><Link href="/lots" className="text-xs font-bold flex items-center gap-1">View all <ArrowRight className="h-3.5 w-3.5"/></Link></div>
  {lots.length===0?<div className="rounded-xl border border-dashed m-5 p-8 text-center"><Package className="mx-auto h-7 w-7 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">No produce listed yet</p><p className="text-xs text-muted-foreground mt-1">Create a lot when your produce is ready for sale.</p><Link href="/lots/new" className="inline-flex mt-4 items-center gap-2 rounded-lg bg-[#171714] px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4"/> Add produce</Link></div>:
  <div className="divide-y divide-border">{lots.map(l=><Link href={`/lots/${l.id}`} key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafaf7]"><CropSticker name={l.crop?.name} size="sm"/><div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{l.crop?.name}{l.variety?` · ${l.variety}`:""}</p><p className="text-xs text-muted-foreground mt-1">{l.quantity.value} {l.quantity.unit}</p></div><Badge tone={toneForStatus(l.status)}>{l.status.replace(/_/g," ")}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground"/></Link>)}</div>}
 </Card>;
}

function CategoryCard({title,description,icon,kind,href,ribbon}:{title:string;description:string;icon:React.ReactNode;kind:string;href:string;ribbon?:string}){
 return <Link href={href} className="flex flex-col overflow-hidden rounded-lg border border-border bg-white transition hover:border-[#a8842f] hover:shadow-lg">
  <div className={`img-zoom relative flex h-[130px] w-full items-center justify-center ${TILE_STYLE[kind] ?? "bg-[#f1f3f6]"}`}>
   {ribbon && <span className="ribbon"><Sparkles className="h-3 w-3"/> {ribbon}</span>}
   <span className="[&>svg]:h-11 [&>svg]:w-11" aria-hidden>{icon}</span>
  </div>
  <div className="flex items-center justify-between gap-2 px-4 py-3">
   <span className="min-w-0"><b className="block truncate text-sm font-bold text-[#171714]">{title}</b><small className="block truncate text-xs text-muted-foreground">{description}</small></span>
   <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
  </div>
 </Link>;
}

function MarketplaceShortcuts(){
 return <section className="mt-7 fade-in-up d1">
  <div className="flex items-end justify-between mb-4"><div><h2 className="section-title">What do you want to do?</h2><p className="text-sm text-muted-foreground mt-1">Simple shortcuts for your farm, crops and market.</p></div><Link href="/market" className="text-sm font-bold flex items-center gap-1">See market <ArrowRight className="h-4 w-4"/></Link></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{ACTIONS.map((a,i)=><CategoryCard key={a.href} title={a.title} description={a.description} icon={a.icon} kind={a.kind} href={a.href} ribbon={i===0?"Popular":i===2?"Live prices":undefined}/>)}</div>
 </section>;
}

function SaleCards(){
 return <section className="mt-6 grid gap-4 sm:grid-cols-3 fade-in-up d2">
  {SALE_CARDS.map(s=><Link href={s.href} key={s.href} className={`group flex items-center justify-between gap-3 overflow-hidden rounded-lg p-5 transition hover:shadow-lg ${s.bg}`}>
   <span className="min-w-0">
    <b className={`block text-base font-extrabold leading-tight ${s.text}`}>{s.title}</b>
    <small className={`mt-1 block text-xs leading-5 ${s.sub}`}>{s.description}</small>
    <span className={`mt-3 inline-flex items-center rounded-md px-3 py-2 text-xs font-bold transition group-hover:brightness-110 ${s.btn}`}>{s.cta}</span>
   </span>
   <span className={`flex h-20 w-20 flex-none items-center justify-center rounded-md ${s.iconBg}`} aria-hidden><span className="[&>svg]:h-9 [&>svg]:w-9">{s.icon}</span></span>
  </Link>)}
 </section>;
}

function MarketPreview(){
 return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="section-title">Market at a glance</h2><p className="text-xs text-muted-foreground mt-1">Check the numbers before you decide.</p></div><Link href="/market" className="text-xs font-bold">Open market →</Link></div>
  <div className="grid grid-cols-2 divide-x divide-border"><Link href="/market" className="p-5 hover:bg-[#fafaf7]"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today&apos;s rates</span><strong className="mt-2 block text-xl font-black">View mandi prices</strong><span className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><TrendingUp className="h-3.5 w-3.5"/> Compare markets</span></Link><Link href="/forecasts" className="p-5 hover:bg-[#fafaf7]"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Decision tool</span><strong className="mt-2 block text-xl font-black">Price forecast</strong><span className="mt-1 text-xs text-muted-foreground">See the outlook for your crops</span></Link></div>
 </Card>;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "F";
}

function DashboardContent(){
 const {user}=useAuth();
 const profile=useFarmerProfileQuery();
 if(!user)return null;
 return <div>
  <div className="dashboard-hero fade-in-up">
  <Image src="/images/image.png" alt="Farmer using a phone while working on the farm" fill priority sizes="100vw" className="dashboard-hero-bg" />
   <div className="dashboard-hero-copy"><div className="dashboard-kicker">YOUR FARM HOME</div><h1>Welcome back, <span translate="no">{user.fullName.split(" ")[0]}</span>.</h1><p>Everything you need to grow, check prices and sell your produce.</p><div className="dashboard-hero-actions"><Link href="/lots/new" className="dashboard-primary"><Plus className="h-5 w-5"/> Sell produce</Link><Link href="/market" className="dashboard-secondary"><Search className="h-5 w-5"/> Check market</Link></div>
    <div className="trust-bar">
     <div className="trust-item"><BadgeCheck/><span>Verified<br/>farmers</span></div>
     <div className="trust-item"><Users/><span>Direct buyer<br/>access</span></div>
     <div className="trust-item"><MapPinned/><span>Pan-India<br/>delivery</span></div>
     <div className="trust-item"><ShieldCheck/><span>Secure<br/>payments</span></div>
    </div>
   </div>
   <div className="dashboard-hero-side">
    <Link href="/profile" className="hero-profile-card">
     <span className="avatar">{initials(user.fullName)}</span>
     <span className="min-w-0">
      <b className="block truncate">{user.fullName}</b>
      <small className="block truncate">{ROLE_LABEL[user.role] ?? "Farmer"} · {user.mobile}</small>
     </span>
     <ChevronRight className="h-4 w-4 shrink-0"/>
    </Link>
    {profile.data && (
     <div className="hero-profile-progress">
      <span>Profile {profile.data.completion.percentage}% complete</span>
      <div className="hero-profile-bar"><span style={{width:`${profile.data.completion.percentage}%`}}/></div>
     </div>
    )}
    <div className="hero-side-label">QUICK VIEW</div><div className="hero-side-row"><span>Market prices</span><Link href="/market">Open →</Link></div><div className="hero-side-row"><span>Trade offers</span><Link href="/trade-offers">Review →</Link></div><div className="hero-side-row"><span>Shipments</span><Link href="/shipments">Track →</Link></div>
   </div>
  </div>
  {user.accountStatus === "PENDING_VERIFICATION" && <Alert variant="info" className="my-5">Your account is pending verification. Some actions may stay limited until it is confirmed.</Alert>}
  <div className="mt-5 fade-in-up"><div className="mb-3"><h2 className="section-title">Your day at a glance</h2><p className="text-sm text-muted-foreground mt-1">A quick look at what is happening with your farm.</p></div><DashboardStats/></div>
  <MarketplaceShortcuts/>
  <SaleCards/>
  <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_.75fr] fade-in-up d3"><div className="space-y-5"><RecentProduce/><MarketPreview/></div><div className="space-y-5">{profile.isLoading?<LoadingBlock/>:profile.isError?<ErrorBlock message={profile.error instanceof ApiRequestError?profile.error.message:"Could not load profile."} onRetry={()=>profile.refetch()}/>:profile.data?<ProfileCompletionCard completion={profile.data.completion} showLinkToProfile/>:null}<Card><div className="p-5"><h2 className="section-title">Useful tools</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Keep decisions and operations in one place.</p><div className="mt-4 grid gap-2"><Link href="/sell-vs-store" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">Sell vs store <Scale className="h-4 w-4"/></Link><Link href="/quality" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">Quality <ShieldCheck className="h-4 w-4"/></Link><Link href="/fpo-membership" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">My FPO <Building2 className="h-4 w-4"/></Link></div></div></Card></div></div>
 </div>;
}
export default function DashboardPage(){return <RoleProtectedPage role="FARMER"><DashboardContent/></RoleProtectedPage>}