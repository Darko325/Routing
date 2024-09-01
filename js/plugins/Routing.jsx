import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { createPlugin } from '@mapstore/utils/PluginsUtils';
import { changeMapView } from '@mapstore/actions/map';
import { mapSelector } from '@mapstore/selectors/map';
import L from 'leaflet';
import polyline from '@mapbox/polyline';

// Define the Routing component
const Routing = ({ map, onChangeMapView }) => {
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [routeLayer, setRouteLayer] = useState(null);
    const [error, setError] = useState(null);
    const [geocodedLocations, setGeocodedLocations] = useState({ start: null, end: null });

    useEffect(() => {
        // Check if map is a valid Leaflet map instance
        if (map && map instanceof L.Map) {
            console.log('Valid Leaflet map instance:', map);
        } else {
            console.error('The map object is not a Leaflet map:', map);
        }
    }, [map]);

    const geocodeLocation = async (location) => {
        try {
            // Use HERE API for geocoding
            const hereResponse = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(location)}&in=countryCode:SRB&apikey=hav622MtM-0chHNAe--c0C95dgiHJRW0mAb0Fpv7A9Y`);
            const hereData = await hereResponse.json();
            console.log('HERE Geocode API response:', hereData);

            if (hereData.items && hereData.items.length > 0) {
                return hereData.items[0].position;
            }
        } catch (error) {
            console.error('Error with HERE geocoding:', error);
        }

        try {
            // Use Nominatim API as a fallback
            const nominatimResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}, Serbia`);
            const nominatimData = await nominatimResponse.json();
            console.log('Nominatim Geocode API response:', nominatimData);

            if (nominatimData && nominatimData.length > 0) {
                return { lat: parseFloat(nominatimData[0].lat), lng: parseFloat(nominatimData[0].lon) };
            }
        } catch (error) {
            console.error('Error with Nominatim geocoding:', error);
        }

        throw new Error(`Could not geocode location: ${location}`);
    };

    const fetchHERERoute = async (startCoords, endCoords) => {
        const response = await fetch(`https://router.hereapi.com/v8/routes?transportMode=car&origin=${startCoords.lat},${startCoords.lng}&destination=${endCoords.lat},${endCoords.lng}&return=polyline,summary&apikey=hav622MtM-0chHNAe--c0C95dgiHJRW0mAb0Fpv7A9Y`);
        const data = await response.json();
        console.log('HERE Routing API response:', data);
        return data;
    };

    const fetchOSRMRoute = async (startCoords, endCoords) => {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${startCoords.lng},${startCoords.lat};${endCoords.lng},${endCoords.lat}?overview=full&geometries=polyline`);
        const data = await response.json();
        console.log('OSRM Routing API response:', data);
        return data;
    };

    const handleDrawRoute = async () => {
        if (!startLocation.trim() || !endLocation.trim()) {
            setError("Please enter both start and end locations.");
            return;
        }

        setIsSearching(true);
        setError(null);
        setGeocodedLocations({ start: null, end: null });

        try {
            // Geocode start location
            const startCoords = await geocodeLocation(startLocation);
            if (!startCoords || !startCoords.lat || !startCoords.lng) {
                throw new Error(`Failed to geocode start location: ${startLocation}`);
            }

            // Geocode end location
            const endCoords = await geocodeLocation(endLocation);
            if (!endCoords || !endCoords.lat || !endCoords.lng) {
                throw new Error(`Failed to geocode end location: ${endLocation}`);
            }

            setGeocodedLocations({ start: startCoords, end: endCoords });

            // Ensure map is valid
            if (!map || !(map instanceof L.Map)) {
                throw new Error('Invalid map instance. Ensure the map object is a Leaflet map.');
            }

            // Try HERE routing first
            let routeData = await fetchHERERoute(startCoords, endCoords);
            let useOSRM = false;

            if (!routeData.routes || routeData.routes.length === 0) {
                console.log('HERE routing failed, trying OSRM...');
                routeData = await fetchOSRMRoute(startCoords, endCoords);
                useOSRM = true;
            }

            if ((useOSRM && routeData.code === 'Ok') || (!useOSRM && routeData.routes && routeData.routes.length > 0)) {
                let polylineEncoded, summary;
                if (useOSRM) {
                    polylineEncoded = routeData.routes[0].geometry;
                    summary = {
                        length: routeData.routes[0].distance,
                        duration: routeData.routes[0].duration
                    };
                } else {
                    polylineEncoded = routeData.routes[0].sections[0].polyline;
                    summary = routeData.routes[0].sections[0].summary;
                }

                const decodedPolyline = polyline.decode(polylineEncoded);

                if (routeLayer) {
                    map.removeLayer(routeLayer);
                }

                const newRouteLayer = L.polyline(decodedPolyline, { color: 'blue', weight: 5 }).addTo(map);
                setRouteLayer(newRouteLayer);

                const bounds = L.latLngBounds(decodedPolyline);
                onChangeMapView(bounds.getCenter(), 10, bounds);

                setError(`Route found using ${useOSRM ? 'OSRM' : 'HERE'} API! Distance: ${(summary.length / 1000).toFixed(2)} km, Duration: ${(summary.duration / 3600).toFixed(2)} hours`);
            } else {
                throw new Error('No route found with either HERE or OSRM APIs');
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            setError(`Unable to draw route. ${error.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    return (
        <div style={{
            position: 'absolute',
            zIndex: 100,
            top: 80,
            right: 80,
            backgroundColor: '#ffffff',
            padding: 16,
            borderRadius: 8,
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            width: '300px'
        }}>
            <input
                type="text"
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                placeholder="Start location (e.g., Skopje, North Macedonia)"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            <input
                type="text"
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                placeholder="End location (e.g., Belgrade, Serbia)"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            <button
                className="btn btn-primary"
                onClick={handleDrawRoute}
                disabled={isSearching}
                style={{ width: '100%', marginBottom: '8px' }}
            >
                {isSearching ? 'Drawing Route...' : 'Draw Route'}
            </button>
            {error && (
                <div style={{ color: error.startsWith('Route found') ? 'green' : 'red', marginTop: '8px' }}>
                    {error}
                </div>
            )}
            {geocodedLocations.start && geocodedLocations.end && (
                <div style={{ marginTop: '8px', fontSize: '12px' }}>
                    <div>Start: {geocodedLocations.start.lat}, {geocodedLocations.start.lng}</div>
                    <div>End: {geocodedLocations.end.lat}, {geocodedLocations.end.lng}</div>
                </div>
            )}
        </div>
    );
};

// Connect the Routing component to the Redux store
const ConnectedRouting = connect(
    state => ({
        map: mapSelector(state)
    }),
    {
        onChangeMapView: changeMapView
    }
)(Routing);

// Export the plugin
export default createPlugin('Routing', {
    component: ConnectedRouting
});