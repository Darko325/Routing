import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { createPlugin } from '@mapstore/utils/PluginsUtils';
import { addLayer, removeLayer } from '@mapstore/actions/layers';
import { zoomToExtent } from '@mapstore/actions/map';
import './Routing.css';

const HERE_API_KEY = 'xR3aaz-LsnU5pfO-VzjmD3Y2WGoigNkOKbw5Xapz7HY';

const Routing = ({ addLayer, removeLayer, zoomToExtent }) => {
    const [locations, setLocations] = useState({ start: '', end: '' });
    const [suggestions, setSuggestions] = useState({ start: [], end: [] });
    const [status, setStatus] = useState({ isSearching: false, message: null });

    useEffect(() => {
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = resolve;
                script.onerror = reject;
                document.body.appendChild(script);
            });
        };

        const loadHereMapsAPI = async () => {
            try {
                await loadScript("https://js.api.here.com/v3/3.1/mapsjs-core.js");
                await loadScript("https://js.api.here.com/v3/3.1/mapsjs-service.js");
                await loadScript("https://js.api.here.com/v3/3.1/mapsjs-mapevents.js"); // Load map events script
            } catch (error) {
                console.error('Failed to load HERE Maps API:', error);
            }
        };

        loadHereMapsAPI();
    }, []);

    const fetchSuggestions = async (query, type) => {
        if (query.trim() === '') {
            setSuggestions(prev => ({ ...prev, [type]: [] }));
            return;
        }

        try {
            const response = await fetch(`https://autocomplete.search.hereapi.com/v1/autocomplete?q=${encodeURIComponent(query)}&apiKey=${HERE_API_KEY}`);
            const data = await response.json();
            setSuggestions(prev => ({ ...prev, [type]: data.items?.map(item => item.title) || [] }));
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            setSuggestions(prev => ({ ...prev, [type]: [] }));
        }
    };

    const handleLocationChange = (e, type) => {
        const value = e.target.value;
        setLocations(prev => ({ ...prev, [type]: value }));
        fetchSuggestions(value, type);
    };

    const handleSuggestionClick = async (suggestion, type) => {
        setLocations(prev => ({ ...prev, [type]: suggestion }));
        setSuggestions(prev => ({ ...prev, [type]: [] }));

        // Geocode the selected suggestion and zoom to that location
        try {
            const { coords, address } = await geocodeLocation(suggestion);
            zoomToLocation(coords);
            addMarker(coords, address, type);
        } catch (error) {
            console.error(`Error zooming to ${type} location:`, error);
        }
    };

    const geocodeLocation = async (location) => {
        const response = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(location)}&apiKey=${HERE_API_KEY}`);
        const data = await response.json();
        if (data?.items?.[0]?.position) {
            return {
                coords: data.items[0].position,
                address: data.items[0].title // Get the address
            };
        }
        throw new Error(`Location not found: ${location}`);
    };

    const zoomToLocation = (coords) => {
        const bufferDegrees = 0.02; // Adjust this value to change the zoom level
        const extent = [
            coords.lng - bufferDegrees,
            coords.lat - bufferDegrees,
            coords.lng + bufferDegrees,
            coords.lat + bufferDegrees
        ];
        zoomToExtent(extent, 'EPSG:4326');
    };

    const addMarker = (coords, address, type) => {
        // Create a GeoJSON feature for the marker
        const markerFeature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [coords.lng, coords.lat]
            },
            properties: {
                type: type,
                address: address
            }
        };
    
        // Define styles for start and end markers
        const startStyle = {
            iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z" fill="#00FF00"/>
                    <circle cx="12" cy="8" r="4" fill="white"/>
                </svg>
            `),
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        };
    
        const endStyle = {
            iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z" fill="#FF0000"/>
                    <circle cx="12" cy="8" r="4" fill="white"/>
                </svg>
            `),
            iconSize: [24, 24],
            iconAnchor: [12, 24]
        };
    
        // Add the layer with the marker
        addLayer({
            id: `${type}MarkerLayer`,
            name: `${type.charAt(0).toUpperCase() + type.slice(1)} Marker`,
            type: 'vector',
            visibility: true,
            features: [markerFeature],
            style: type === 'start' ? startStyle : endStyle
        });
    };
    
    const getRoute = async (startCoords, endCoords) => {
        const url = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${startCoords.lat},${startCoords.lng}&destination=${endCoords.lat},${endCoords.lng}&return=polyline,summary&apiKey=${HERE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data?.routes?.[0]) return data;
        throw new Error('No routes found.');
    };

    const drawRoute = (polyline, startCoords, endCoords) => {
        removeLayer('routeLayer');
        const H = window.H;
        const lineString = H.geo.LineString.fromFlexiblePolyline(polyline);
        const routeCoordinates = lineString.getLatLngAltArray().reduce((acc, coord, index) => {
            if (index % 3 === 0) acc.push([lineString.getLatLngAltArray()[index + 1], coord]);
            return acc;
        }, []);

        const features = [
            { type: 'Feature', geometry: { type: 'LineString', coordinates: routeCoordinates } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [startCoords.lng, startCoords.lat] } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [endCoords.lng, endCoords.lat] } }
        ];

        addLayer({
            id: 'routeLayer',
            name: 'Route',
            type: 'vector',
            visibility: true,
            features,
            style: { weight: 4, opacity: 1, color: 'blue', fillColor: 'red', fillOpacity: 1, radius: 6 }
        });

        const bounds = routeCoordinates.reduce((acc, coord) => [
            Math.min(acc[0], coord[0]), Math.min(acc[1], coord[1]),
            Math.max(acc[2], coord[0]), Math.max(acc[3], coord[1])
        ], [Infinity, Infinity, -Infinity, -Infinity]);

        zoomToExtent(bounds, 'EPSG:4326');
    };

    const handleDrawRoute = async () => {
        if (!locations.start || !locations.end) {
            setStatus({ isSearching: false, message: "Please enter both start and end locations." });
            return;
        }

        setStatus({ isSearching: true, message: null });

        try {
            const startCoords = await geocodeLocation(locations.start);
            const endCoords = await geocodeLocation(locations.end);
            const route = await getRoute(startCoords.coords, endCoords.coords);

            const section = route.routes[0].sections[0];
            if (section.polyline) {
                drawRoute(section.polyline, startCoords.coords, endCoords.coords);
                const distance = (section.summary.length / 1000).toFixed(2);
                const duration = Math.round(section.summary.duration / 60);
                setStatus({ isSearching: false, message: `Route found! Distance: ${distance} km, Duration: ${duration} minutes` });
            } else {
                throw new Error('No polyline data in the route response');
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            setStatus({ isSearching: false, message: `Unable to draw route. ${error.message}` });
        }
    };

    return (
        <div className="routing-plugin">
            {['start', 'end'].map((type) => (
                <div key={type} className="location-input">
                    <input
                        type="text"
                        value={locations[type]}
                        onChange={(e) => handleLocationChange(e, type)}
                        onBlur={() => setTimeout(() => setSuggestions(prev => ({ ...prev, [type]: [] })), 200)}
                        placeholder={`${type.charAt(0).toUpperCase() + type.slice(1)} location`}
                    />
                    {suggestions[type].length > 0 && (
                        <ul className="suggestions-list">
                            {suggestions[type].map((suggestion, index) => (
                                <li key={index} onClick={() => handleSuggestionClick(suggestion, type)}>
                                    {suggestion}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ))}
            <button onClick={handleDrawRoute} disabled={status.isSearching}>
                {status.isSearching ? 'Drawing Route...' : 'Draw Route'}
            </button>
            {status.message && (
                <div className={`status-message ${status.message.startsWith('Route found') ? 'success' : 'error'}`}>
                    {status.message}
                </div>
            )}
        </div>
    );
};

const ConnectedRouting = connect(null, { addLayer, removeLayer, zoomToExtent })(Routing);

export default createPlugin('Routing', {
    component: ConnectedRouting
});
