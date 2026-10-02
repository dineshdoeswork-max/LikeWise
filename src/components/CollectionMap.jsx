'use client';
import {useEffect, useRef, useState} from 'react';
import {Expand, Layers, RefreshCw} from 'lucide-react';
import {priority, splitRouteIntoTrips} from '../utils/optimizer';

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const validPoint = point => Number.isFinite(point.lat) && Number.isFinite(point.lng);

export default function CollectionMap({requests, onSelect, onPin, pinning, selected, route, team, focus}) {
 const el = useRef(null);
 const callbacks = useRef({onPin, pinning});
 const [instance, setInstance] = useState(null);
 const [provider, setProvider] = useState(CARTO_KEY ? 'carto' : 'osm');
 const [attempt, setAttempt] = useState(0);
 const [status, setStatus] = useState('loading');
 const [activeProvider, setActiveProvider] = useState(CARTO_KEY ? 'CARTO' : 'OpenStreetMap');

 useEffect(() => { callbacks.current = {onPin, pinning}; }, [onPin, pinning]);

 useEffect(() => {
  let alive = true, map, observer;
  import('leaflet').then(mod => {
   if (!alive) return;
   const L = mod.default;
   map = L.map(el.current, {zoomControl:false}).setView([19.065, 72.844], 14);
   L.control.zoom({position:'bottomright'}).addTo(map);
   map.on('click', event => {
    if (callbacks.current.pinning) callbacks.current.onPin(event.latlng);
   });
   observer = new ResizeObserver(() => map.invalidateSize({pan:false}));
   observer.observe(el.current);
   setInstance({map, L});
  }).catch(() => { if (alive) setStatus('error'); });
  return () => { alive = false; observer?.disconnect(); map?.remove(); };
 }, []);

 useEffect(() => {
  if (!instance) return;
  const {map, L} = instance;
  let alive = true, tiles, timeout;

  function loadProvider(name) {
   clearTimeout(timeout);
   tiles?.off();
   tiles?.remove();
   let failures = 0, loaded = false;
   setStatus('loading');
   setActiveProvider(name === 'carto' ? 'CARTO' : 'OpenStreetMap');
   // CARTO basemaps require `key`, not the platform API's `api_key` parameter.
   const url = name === 'carto'
    ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
   const current = L.tileLayer(url, {
    attribution: OSM_ATTRIBUTION + (name === 'carto' ? ' &copy; <a href="https://carto.com/attributions">CARTO</a>' : ''),
    maxZoom:19,
   });
   tiles = current;
   function unavailable() {
    if (!alive || tiles !== current) return;
    if (name === 'carto') loadProvider('osm');
    else setStatus('error');
   }
   current.on('tileload', () => {
    if (!alive || tiles !== current) return;
    loaded = true;
    clearTimeout(timeout);
    setStatus('ready');
   });
   current.on('tileerror', () => { if (++failures >= 3) unavailable(); });
   current.addTo(map);
   timeout = setTimeout(() => { if (!loaded) unavailable(); }, 10000);
  }
  loadProvider(provider);
  return () => { alive = false; clearTimeout(timeout); tiles?.off(); tiles?.remove(); };
 }, [instance, provider, attempt]);

 useEffect(() => {
  if (!instance) return;
  const {map, L} = instance, layer = L.layerGroup().addTo(map);
  const colors = {high:'#e16355', medium:'#dba13b', low:'#279778'};
  requests.filter(validPoint).forEach(request => {
   const number = route?.orderedRequestIds.indexOf(request.id);
   const color = request.status === 'done' ? '#94a6a0' : colors[priority(request)];
   L.marker([request.lat, request.lng], {
    title:request.location || 'Pickup location',
    alt:request.location || 'Pickup location',
    icon:L.divIcon({className:'custom-marker', html:`<div class="map-pin ${selected?.id === request.id ? 'selected' : ''}" style="--pin:${color}">${number >= 0 ? '<b>' + String(number + 1) + '</b>' : '<span></span>'}</div>`, iconSize:[34,42], iconAnchor:[17,38]}),
   }).addTo(layer).on('click', () => onSelect(request));
  });
  if (route && team) {
   const depot = {lat:team.startLat, lng:team.startLng};
   splitRouteIntoTrips(route, requests, route.options?.capacityBags).forEach((trip, index) => {
    const points = [depot, ...trip.requestIds.map(id => requests.find(r => r.id === id)).filter(Boolean), depot].filter(validPoint);
    L.polyline(points.map(point => [point.lat, point.lng]), {color:['#168568','#3d73a8','#b47b25'][index % 3], weight:4, dashArray:'8 7'}).addTo(layer);
   });
   L.marker([depot.lat, depot.lng], {title:'Depot · unload here', icon:L.divIcon({className:'depot-marker', html:'D', iconSize:[30,30]})}).addTo(layer);
  }
  return () => layer.remove();
 }, [instance, requests, selected, route, team, onSelect]);

 useEffect(() => {
  if (instance && focus && validPoint(focus)) instance.map.flyTo([focus.lat, focus.lng], 15);
 }, [focus, instance]);

 function fitRequests() {
  if (!instance) return;
  const points = requests.filter(r => (!route || route.orderedRequestIds.includes(r.id)) && validPoint(r)).map(r => [r.lat, r.lng]);
  if (route && team) points.push([team.startLat, team.startLng]);
  if (points.length) instance.map.fitBounds(points, {padding:[65,65], maxZoom:15});
 }

 return <>
  <div ref={el} className={'map ' + (pinning ? 'pinning' : '')} aria-label="Interactive Mumbai waste collection map"/>
  <div className="map-tools">
   <label className="map-provider"><Layers size={15}/><select aria-label="Map background" value={provider} onChange={event => setProvider(event.target.value)}>{CARTO_KEY && <option value="carto">CARTO streets</option>}<option value="osm">OpenStreetMap</option></select></label>
   <button aria-label="Fit all pickups on map" title="Fit all pickups" onClick={fitRequests}><Expand size={17}/></button>
  </div>
  <div className={'map-connection ' + status} role="status"><i/>{status === 'loading' ? 'Loading map…' : status === 'error' ? 'Map connection unavailable' : activeProvider + ' · connected'}</div>
  {status === 'error' && <div className="map-warning"><span>Map tiles could not load. Check your connection or try another map background.</span><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14}/>Retry</button></div>}
 </>;
}
