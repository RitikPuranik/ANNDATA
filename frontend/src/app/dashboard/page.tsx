"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Handshake, LineChart, Package, Plus, Scale, ShieldCheck, Sprout, Warehouse, Wheat, ChevronRight, Search, TrendingUp, MapPin, Store, Truck, CircleDollarSign } from "lucide-react";
import { CropSticker } from "@/components/crops/CropSticker";
import Link from "next/link";
import { RoleProtectedPage } from "@/components/RoleProtectedPage";
import { useAuth } from "@/hooks/useAuth";
import { Alert, Card } from "@/components/ui/primitives";
import { Badge, toneForStatus } from "@/components/ui/badge";
import { LoadingBlock, ErrorBlock } from "@/components/StateBlocks";
import { useFarmerProfileQuery } from "@/hooks/useFarmerProfile";
import { ProfileCompletionCard } from "@/components/farmer-profile/ProfileCompletionCard";
import { PageHeader, StatCard } from "@/components/ui/stat-card";
import { ApiRequestError } from "@/types/api";
import { lotApi } from "@/services/lotApi";
import { tradeOfferApi } from "@/services/tradeApi";

const ACTIONS=[
 {title:"My Farms",description:"See your farms and fields.",href:"/farms",icon:<Sprout/>,kind:"crop"},
 {title:"My Crops",description:"Manage the crops you are growing.",href:"/crops",icon:<Wheat/>,kind:"crops"},
 {title:"Market",description:"See today's local market prices.",href:"/market",icon:<Store/>,kind:"market"},
 {title:"Sell Produce",description:"List your crop for buyers.",href:"/lots/new",icon:<Package/>,kind:"sell"},
];

function DashboardStats(){
 const lots=useQuery({queryKey:["lots","mine"],queryFn:()=>lotApi.listMine()});
 const offers=useQuery({queryKey:["trade-offers","mine"],queryFn:()=>tradeOfferApi.list()});
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
 const q=useQuery({queryKey:["lots","mine"],queryFn:()=>lotApi.listMine()});
 if(q.isLoading)return <LoadingBlock/>;
 if(q.isError)return <ErrorBlock message="Could not load your produce." onRetry={()=>q.refetch()}/>;
 const lots=(q.data??[]).slice(0,5);
 return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-bold">Your produce</h2><p className="text-xs text-muted-foreground mt-1">Recent lots and their current status.</p></div><Link href="/lots" className="text-xs font-bold flex items-center gap-1">View all <ArrowRight className="h-3.5 w-3.5"/></Link></div>
  {lots.length===0?<div className="rounded-xl border border-dashed m-5 p-8 text-center"><Package className="mx-auto h-7 w-7 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">No produce listed yet</p><p className="text-xs text-muted-foreground mt-1">Create a lot when your produce is ready for sale.</p><Link href="/lots/new" className="inline-flex mt-4 items-center gap-2 rounded-lg bg-[#171714] px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4"/> Add produce</Link></div>:
  <div className="divide-y divide-border">{lots.map(l=><Link href={`/lots/${l.id}`} key={l.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#fafaf7]"><CropSticker name={l.crop?.name} size="sm"/><div className="min-w-0 flex-1"><p className="font-bold text-sm truncate">{l.crop?.name}{l.variety?` · ${l.variety}`:""}</p><p className="text-xs text-muted-foreground mt-1">{l.quantity} {l.unit}</p></div><Badge tone={toneForStatus(l.status)}>{l.status.replace(/_/g," ")}</Badge><ChevronRight className="h-4 w-4 text-muted-foreground"/></Link>)}</div>}
 </Card>;
}

function ActionVisual({kind}:{kind:string}){
 if(kind==="crops") return <div className="action-visual action-visual-crops"><CropSticker name="wheat" size="md"/><CropSticker name="soybean" size="sm" className="action-mini-sticker"/><CropSticker name="maize" size="sm" className="action-mini-sticker second"/></div>;
 if(kind==="market") return <div className="action-visual action-visual-market"><div className="market-building"><Store/><span>MARKET</span></div><div className="market-price-row"><span>Wheat</span><b>₹2,350</b></div><div className="market-price-row"><span>Soybean</span><b>₹4,120</b></div></div>;
 if(kind==="sell") return <div className="action-visual action-visual-sell"><div className="sell-bag"><Package/></div><div className="sell-route"><span>Farm</span><ArrowRight/><span>Buyer</span></div><b>Ready to sell</b></div>;
 return <div className="action-visual action-visual-farm"><div className="farm-icon"><Sprout/></div><div className="farm-lines"><i/><i/><i/></div><MapPin className="farm-pin"/></div>;
}

function MarketplaceShortcuts(){
 return <section className="mt-7">
  <div className="flex items-end justify-between mb-4"><div><h2 className="text-lg font-bold">What do you want to do?</h2><p className="text-sm text-muted-foreground mt-1">Simple shortcuts for your farm, crops and market.</p></div><Link href="/market" className="text-sm font-bold flex items-center gap-1">See market <ArrowRight className="h-4 w-4"/></Link></div>
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{ACTIONS.map(a=><Link href={a.href} key={a.href} className="quick-card farmer-action-card"><ActionVisual kind={a.kind}/><span className="quick-copy"><b>{a.title}</b><small>{a.description}</small></span><span className="quick-card-arrow"><ChevronRight/></span></Link>)}</div>
 </section>;
}

function MarketPreview(){
 return <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="text-base font-bold">Market at a glance</h2><p className="text-xs text-muted-foreground mt-1">Check the numbers before you decide.</p></div><Link href="/market" className="text-xs font-bold">Open market →</Link></div>
  <div className="grid grid-cols-2 divide-x divide-border"><Link href="/market" className="p-5 hover:bg-[#fafaf7]"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Today's rates</span><strong className="mt-2 block text-xl font-black">View mandi prices</strong><span className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><TrendingUp className="h-3.5 w-3.5"/> Compare markets</span></Link><Link href="/forecasts" className="p-5 hover:bg-[#fafaf7]"><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Decision tool</span><strong className="mt-2 block text-xl font-black">Price forecast</strong><span className="mt-1 text-xs text-muted-foreground">See the outlook for your crops</span></Link></div>
 </Card>;
}

function DashboardContent(){
 const {user}=useAuth(); if(!user)return null;
 const profile=useFarmerProfileQuery();
 return <div>
  <div className="dashboard-hero">
   <div className="dashboard-hero-copy"><div className="dashboard-kicker">YOUR FARM HOME</div><h1>Welcome back, <span translate="no">{user.fullName.split(" ")[0]}</span>.</h1><p>Everything you need to grow, check prices and sell your produce.</p><div className="dashboard-hero-actions"><Link href="/lots/new" className="dashboard-primary"><Plus className="h-5 w-5"/> Sell produce</Link><Link href="/market" className="dashboard-secondary"><Search className="h-5 w-5"/> Check market</Link></div></div>
   <div className="dashboard-hero-side"><div className="hero-side-label">QUICK VIEW</div><div className="hero-side-row"><span>Market prices</span><Link href="/market">Open →</Link></div><div className="hero-side-row"><span>Trade offers</span><Link href="/trade-offers">Review →</Link></div><div className="hero-side-row"><span>Shipments</span><Link href="/shipments">Track →</Link></div></div>
  </div>
  {user.accountStatus === "PENDING_VERIFICATION" && <Alert variant="info" className="my-5">Your account is pending verification. Some actions may stay limited until it is confirmed.</Alert>}
  <div className="mt-5"><div className="mb-3"><h2 className="text-lg font-bold">Your day at a glance</h2><p className="text-sm text-muted-foreground mt-1">A quick look at what is happening with your farm.</p></div><DashboardStats/></div>
  <MarketplaceShortcuts/>
  <div className="mt-6 grid gap-5 lg:grid-cols-[1.35fr_.75fr]"><div className="space-y-5"><RecentProduce/><MarketPreview/></div><div className="space-y-5">{profile.isLoading?<LoadingBlock/>:profile.isError?<ErrorBlock message={profile.error instanceof ApiRequestError?profile.error.message:"Could not load profile."} onRetry={()=>profile.refetch()}/>:profile.data?<ProfileCompletionCard completion={profile.data.completion} showLinkToProfile/>:null}<Card><div className="p-5"><h2 className="text-base font-bold">Useful tools</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Keep decisions and operations in one place.</p><div className="mt-4 grid gap-2"><Link href="/sell-vs-store" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">Sell vs store <Scale className="h-4 w-4"/></Link><Link href="/quality" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">Quality <ShieldCheck className="h-4 w-4"/></Link><Link href="/fpo-membership" className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-xs font-bold hover:bg-[#fafaf7]">My FPO <Building2 className="h-4 w-4"/></Link></div></div></Card></div></div>
 </div>;
}
export default function DashboardPage(){return <RoleProtectedPage role="FARMER"><DashboardContent/></RoleProtectedPage>}
