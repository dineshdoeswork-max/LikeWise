export const DEFAULT_ROUTE_OPTIONS = Object.freeze({capacityBags:25,shiftMinutes:240,averageSpeedKmh:18,serviceMinutes:7});
export function priorityScore(r,now=Date.now()){return r.urgency*3+Math.max(0,(now-new Date(r.createdAt).getTime())/86400000)*2+r.volumeEst;}
export function priority(r,now){const score=priorityScore(r,now);return score>=12?'high':score>=7?'medium':'low';}
export function haversine(a,b){const rad=value=>value*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
const travelMinutes=(distanceKm,speedKmh)=>distanceKm/speedKmh*60;

// Priority-led, capacity-safe morning planning with a depot return after every load.
export function optimizeRoute(team,requests,now=Date.now(),suppliedOptions={}){
 const options={...DEFAULT_ROUTE_OPTIONS,...suppliedOptions};
 const capacityBags=Math.max(1,Number(options.capacityBags)||DEFAULT_ROUTE_OPTIONS.capacityBags),shiftMinutes=Math.max(1,Number(options.shiftMinutes)||DEFAULT_ROUTE_OPTIONS.shiftMinutes),averageSpeedKmh=Math.max(1,Number(options.averageSpeedKmh)||DEFAULT_ROUTE_OPTIONS.averageSpeedKmh),serviceMinutes=Math.max(0,Number(options.serviceMinutes)||0);
 const depot={lat:team.startLat,lng:team.startLng},eligible=requests.filter(r=>r.assignedTeam===team.id&&r.status!=='done'),remaining=[...eligible],trips=[];
 let totalDistanceKm=0,totalMinutes=0;
 while(remaining.length){
  const trip={requestIds:[],loadBags:0,distanceKm:0};let current=depot;
  while(remaining.length){
   const fitting=remaining.filter(r=>r.volumeEst<=capacityBags-trip.loadBags);if(!fitting.length)break;
   const highestBand=['high','medium','low'].find(band=>fitting.some(r=>priority(r,now)===band));
   const candidates=fitting.filter(r=>priority(r,now)===highestBand).sort((a,b)=>{const ad=haversine(current,a),bd=haversine(current,b);const av=priorityScore(a,now)*(1+a.volumeEst/capacityBags)/Math.max(1,travelMinutes(ad,averageSpeedKmh)),bv=priorityScore(b,now)*(1+b.volumeEst/capacityBags)/Math.max(1,travelMinutes(bd,averageSpeedKmh));return bv-av||ad-bd||a.id.localeCompare(b.id);});
   const next=candidates.find(r=>{const outward=haversine(current,r),back=haversine(r,depot);return totalMinutes+travelMinutes(trip.distanceKm+outward+back,averageSpeedKmh)+(trip.requestIds.length+1)*serviceMinutes<=shiftMinutes;});
   if(!next)break;trip.distanceKm+=haversine(current,next);trip.loadBags+=next.volumeEst;trip.requestIds.push(next.id);current=next;remaining.splice(remaining.indexOf(next),1);
  }
  if(!trip.requestIds.length)break;trip.distanceKm+=haversine(current,depot);trip.minutes=travelMinutes(trip.distanceKm,averageSpeedKmh)+trip.requestIds.length*serviceMinutes;totalDistanceKm+=trip.distanceKm;totalMinutes+=trip.minutes;trips.push(trip);
 }
 const orderedRequestIds=trips.flatMap(trip=>trip.requestIds);
 return {teamId:team.id,orderedRequestIds,totalDistanceKm,totalMinutes,totalLoadBags:trips.reduce((sum,trip)=>sum+trip.loadBags,0),trips,deferredRequestIds:eligible.filter(r=>!orderedRequestIds.includes(r.id)).map(r=>r.id),options:{capacityBags,shiftMinutes,averageSpeedKmh,serviceMinutes}};
}

// Database routes keep a compact ID list; rebuild capacity groups when reading them.
export function splitRouteIntoTrips(route,requests,capacityBags=DEFAULT_ROUTE_OPTIONS.capacityBags){
 if(route?.trips?.length)return route.trips;const trips=[];let trip={requestIds:[],loadBags:0};
 for(const id of route?.orderedRequestIds||[]){const request=requests.find(r=>r.id===id);if(!request)continue;if(trip.requestIds.length&&trip.loadBags+request.volumeEst>capacityBags){trips.push(trip);trip={requestIds:[],loadBags:0};}trip.requestIds.push(id);trip.loadBags+=request.volumeEst;}
 if(trip.requestIds.length)trips.push(trip);return trips;
}
