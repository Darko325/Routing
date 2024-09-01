import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { createPlugin } from '@mapstore/utils/PluginsUtils';
import { changeMapView } from '@mapstore/actions/map';
import { mapSelector, projectionSelector } from '@mapstore/selectors/map';
import polyline from '@mapbox/polyline';
import proj4 from 'proj4';
import ol from 'ol';

// Define projection definitions
const projections = {
    'EPSG:4326': 'EPSG:4326',
    'EPSG:3857': 'EPSG:3857'
};

// Example projection definitions
proj4.defs(projections['EPSG:4326'], '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(projections['EPSG:3857'], '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs');

// Custom polyline decoder function
function customPolylineDecode(str) {
    const coordinates = [];
    let index = 0, lat = 0, lng = 0;

    while (index < str.length) {
        let result = 1, shift = 0, b;
        do {
            b = str.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);
        lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

        result = 1;
        shift = 0;
        do {
            b = str.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);
        lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

        coordinates.push([lat * 1e-5, lng * 1e-5]);
    }
    return coordinates;
}

const Routing = ({ map, projection, onChangeMapView }) => {
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [routeLayerId, setRouteLayerId] = useState(null);
    const [error, setError] = useState(null);
    const [geocodedLocations, setGeocodedLocations] = useState({ start: null, end: null });

    useEffect(() => {
        let isMounted = true;
        return () => {
            isMounted = false;
        };
    }, []);

    const isValidCoordinate = (coord) => {
        return coord && 
               typeof coord.lat === 'number' && 
               typeof coord.lng === 'number' && 
               isFinite(coord.lat) && 
               isFinite(coord.lng) &&
               coord.lat >= -90 && 
               coord.lat <= 90 && 
               coord.lng >= -180 && 
               coord.lng <= 180;
    };

    const geocodeLocation = async (location) => {
        try {
            // Use HERE API for geocoding
            const hereResponse = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(location)}&in=countryCode:SRB&apikey=aC9vErGLcPMX1dChkSb2Ue0gzcNwbMsN4DuuqVndLiA`);
            const hereData = await hereResponse.json();
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
            if (nominatimData && nominatimData.length > 0) {
                return { lat: parseFloat(nominatimData[0].lat), lng: parseFloat(nominatimData[0].lon) };
            }
        } catch (error) {
            console.error('Error with Nominatim geocoding:', error);
        }

        throw new Error(`Could not geocode location: ${location}`);
    };

    const fetchHERERoute = async (startCoords, endCoords) => {
        try {
            const response = await fetch(`https://router.hereapi.com/v8/routes?transportMode=car&origin=${startCoords.lat},${startCoords.lng}&destination=${endCoords.lat},${endCoords.lng}&return=polyline,summary&apikey=aC9vErGLcPMX1dChkSb2Ue0gzcNwbMsN4DuuqVndLiA`);
            const data = await response.json();
            console.log('HERE API response:', JSON.stringify(data, null, 2));
            if (data.routes && data.routes.length > 0 && data.routes[0].sections && data.routes[0].sections.length > 0) {
                return data;
            } else {
                throw new Error('HERE routing returned invalid or empty route data');
            }
        } catch (error) {
            console.error('Error fetching HERE route:', error);
            throw error;
        }
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
            const startCoords = await geocodeLocation(startLocation);
            const endCoords = await geocodeLocation(endLocation);

            // Check if coordinates are valid
            if (!isValidCoordinate(startCoords) || !isValidCoordinate(endCoords)) {
                throw new Error('Invalid coordinates received from geocoding');
            }

            setGeocodedLocations({ start: startCoords, end: endCoords });

            const routeData = await fetchHERERoute(startCoords, endCoords);

            const polylineEncoded = routeData.routes[0].sections[0].polyline;
            const summary = routeData.routes[0].sections[0].summary;

            console.log('Raw polyline from HERE API:', polylineEncoded);

            if (!/^[A-Za-z0-9\-_]+$/.test(polylineEncoded)) {
                throw new Error('Invalid polyline format received from HERE API');
            }

            let decodedPolyline;
            try {
                decodedPolyline = polyline.decode(polylineEncoded);
                console.log('Decoded polyline:', decodedPolyline);
            } catch (decodeError) {
                console.warn('Failed to decode with @mapbox/polyline, trying custom decoder');
                decodedPolyline = customPolylineDecode(polylineEncoded);
                console.log('Custom decoded polyline:', decodedPolyline);
            }

            if (!decodedPolyline.every(coords => isValidCoordinate({ lat: coords[0], lng: coords[1] }))) {
                throw new Error('Invalid coordinates in decoded polyline');
            }

            const geojsonRoute = {
                type: 'FeatureCollection',
                features: [
                    {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: decodedPolyline.map(coords => [coords[1], coords[0]])
                        },
                        properties: {
                            name: 'Route',
                            distance: summary.length,
                            duration: summary.duration
                        }
                    }
                ]
            };

            // Reproject the GeoJSON to the current map projection
            const reprojectedGeoJSON = {
                type: 'FeatureCollection',
                features: geojsonRoute.features.map(feature => {
                    const reprojectedCoords = feature.geometry.coordinates.map(coord => {
                        const reprojected = proj4('EPSG:4326', projection, coord);
                        if (!isValidCoordinate({ lat: reprojected[1], lng: reprojected[0] })) {
                            throw new Error('Invalid coordinate after reprojection');
                        }
                        return reprojected;
                    });
                    return {
                        ...feature,
                        geometry: {
                            ...feature.geometry,
                            coordinates: reprojectedCoords
                        }
                    };
                })
            };

            // Remove existing route layer if present
            if (routeLayerId && map.getLayers) {
                const layers = map.getLayers().getArray();
                const existingLayer = layers.find(layer => layer.get('id') === routeLayerId);
                if (existingLayer) {
                    map.removeLayer(existingLayer);
                }
            }

            // Add the reprojected route to the map as a new layer
            const newLayer = new ol.layer.Vector({
                source: new ol.source.Vector({
                    features: new ol.format.GeoJSON().readFeatures(reprojectedGeoJSON)
                }),
                style: new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: '#0000FF',
                        width: 5
                    })
                })
            });
            newLayer.set('id', 'routeLayer');

            map.addLayer(newLayer);
            setRouteLayerId('routeLayer');

            // Define bounds for the map view
            const extent = ol.extent.boundingExtent(decodedPolyline.map(c => [c[1], c[0]]));
            map.getView().fit(ol.proj.transformExtent(extent, 'EPSG:4326', projection), { padding: [50, 50, 50, 50] });

            setError(`Route found! Distance: ${(summary.length / 1000).toFixed(2)} km, Duration: ${(summary.duration / 3600).toFixed(2)} hours`);
        } catch (error) {
            console.error('Error drawing route:', error);
            setError(`Unable to draw route. ${error.message}. Please check the console for more details.`);
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
                placeholder="Start location (e.g., Skopje)"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            <input
                type="text"
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                placeholder="End location (e.g., Nis)"
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

const ConnectedRouting = connect(
    state => ({
        map: mapSelector(state),
        projection: projectionSelector(state),
    }),
    {
        onChangeMapView: changeMapView,
    }
)(Routing);

export default createPlugin('Routing', {
    component: ConnectedRouting
});