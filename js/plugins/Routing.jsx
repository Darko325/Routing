import React, { useState, useEffect } from 'react';
import { connect } from 'react-redux';
import { createPlugin } from '@mapstore/utils/PluginsUtils';
import { addLayer, removeLayer } from '@mapstore/actions/layers';
import { zoomToExtent } from '@mapstore/actions/map';

const HERE_API_KEY = 'aC9vErGLcPMX1dChkSb2Ue0gzcNwbMsN4DuuqVndLiA';

const Routing = ({ addLayer, removeLayer, zoomToExtent }) => {
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [startSuggestions, setStartSuggestions] = useState([]);
    const [endSuggestions, setEndSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Load HERE Maps API script
        const script = document.createElement('script');
        script.src = "https://js.api.here.com/v3/3.1/mapsjs-core.js";
        script.async = true;
        document.body.appendChild(script);

        script.onload = () => {
            const script2 = document.createElement('script');
            script2.src = "https://js.api.here.com/v3/3.1/mapsjs-service.js";
            script2.async = true;
            document.body.appendChild(script2);
        };

        return () => {
            document.body.removeChild(script);
            document.body.removeChild(script2);
        };
    }, []);

    const fetchSuggestions = async (query, setSuggestions) => {
        if (query.trim() === '') {
            setSuggestions([]);
            return;
        }

        try {
            const response = await fetch(`https://autocomplete.search.hereapi.com/v1/autocomplete?q=${encodeURIComponent(query)}&apiKey=${HERE_API_KEY}`);
            const data = await response.json();
            if (data && data.items) {
                setSuggestions(data.items.map(item => item.title));
            } else {
                setSuggestions([]);
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            setSuggestions([]);
        }
    };

    const handleDrawRoute = async () => {
        if (!startLocation.trim() || !endLocation.trim()) {
            setError("Please enter both start and end locations.");
            return;
        }

        setIsSearching(true);
        setError(null);

        try {
            const startCoords = await geocodeLocation(startLocation);
            const endCoords = await geocodeLocation(endLocation);

            const route = await getRoute(startCoords, endCoords);
            console.log('Route data:', JSON.stringify(route, null, 2)); // Debug log

            if (route && route.routes && route.routes[0] && route.routes[0].sections) {
                const section = route.routes[0].sections[0];
                if (section.polyline) {
                    drawRoute(section.polyline, startCoords, endCoords);

                    const distance = section.summary.length / 1000; // Convert to km
                    const duration = section.summary.duration / 60; // Convert to minutes
                    setError(`Route found! Distance: ${distance.toFixed(2)} km, Duration: ${duration.toFixed(0)} minutes`);
                } else {
                    throw new Error('No polyline data in the route response');
                }
            } else {
                throw new Error('Unexpected route data structure');
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            setError(`Unable to draw route. ${error.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    const drawRoute = (polyline, startCoords, endCoords) => {
        // Remove existing route layer if any
        removeLayer('routeLayer');

        // Decode the flexible polyline
        const H = window.H;
        const lineString = H.geo.LineString.fromFlexiblePolyline(polyline);
        const routeCoordinates = lineString.getLatLngAltArray();

        // Create a GeoJSON feature for the route
        const routeFeature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: routeCoordinates.map((coord, index) => {
                    if (index % 3 === 0) {
                        return [routeCoordinates[index + 1], routeCoordinates[index]];
                    }
                }).filter(Boolean)
            }
        };

        // Create GeoJSON features for start and end points
        const startFeature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [startCoords.lng, startCoords.lat]
            }
        };

        const endFeature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [endCoords.lng, endCoords.lat]
            }
        };

        // Add the new layer to the map
        addLayer({
            id: 'routeLayer',
            name: 'Route',
            type: 'vector',
            visibility: true,
            features: [routeFeature, startFeature, endFeature],
            style: {
                weight: 4,
                opacity: 1,
                color: 'blue',
                fillColor: 'red',
                fillOpacity: 1,
                radius: 6
            }
        });

        // Zoom to the route extent
        const bounds = getBounds(routeFeature.geometry.coordinates);
        zoomToExtent(bounds, 'EPSG:4326');
    };

    const getBounds = (coordinates) => {
        if (!Array.isArray(coordinates) || coordinates.length === 0) {
            console.error('Invalid coordinates:', coordinates);
            return [-180, -90, 180, 90]; // Default to world bounds
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coordinates.forEach(coord => {
            if (Array.isArray(coord) && coord.length >= 2) {
                const [x, y] = coord;
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        });

        return [minX, minY, maxX, maxY];
    };

    const geocodeLocation = async (location) => {
        try {
            const response = await fetch(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(location)}&apiKey=${HERE_API_KEY}`);
            const data = await response.json();
            if (data && data.items && data.items.length > 0) {
                const { position } = data.items[0];
                return { lat: position.lat, lng: position.lng };
            } else {
                throw new Error(`Location not found: ${location}`);
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            throw new Error(`Failed to geocode location: ${location}`);
        }
    };

    const getRoute = async (startCoords, endCoords) => {
        const url = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${startCoords.lat},${startCoords.lng}&destination=${endCoords.lat},${endCoords.lng}&return=polyline,summary&apiKey=${HERE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data && data.routes && data.routes.length > 0) {
            return data;
        } else {
            throw new Error('No routes found.');
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
                onChange={(e) => {
                    setStartLocation(e.target.value);
                    fetchSuggestions(e.target.value, setStartSuggestions);
                }}
                onBlur={() => setTimeout(() => setStartSuggestions([]), 200)}
                placeholder="Start location"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            {startSuggestions.length > 0 && (
                <ul style={{
                    listStyleType: 'none',
                    margin: 0,
                    padding: 0,
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    position: 'absolute',
                    backgroundColor: '#fff',
                    zIndex: 100
                }}>
                    {startSuggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onClick={() => {
                                setStartLocation(suggestion);
                                setStartSuggestions([]);
                            }}
                            style={{ cursor: 'pointer', padding: '4px 8px' }}
                        >
                            {suggestion}
                        </li>
                    ))}
                </ul>
            )}
            <input
                type="text"
                value={endLocation}
                onChange={(e) => {
                    setEndLocation(e.target.value);
                    fetchSuggestions(e.target.value, setEndSuggestions);
                }}
                onBlur={() => setTimeout(() => setEndSuggestions([]), 200)}
                placeholder="End location"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            {endSuggestions.length > 0 && (
                <ul style={{
                    listStyleType: 'none',
                    margin: 0,
                    padding: 0,
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    position: 'absolute',
                    backgroundColor: '#fff',
                    zIndex: 100
                }}>
                    {endSuggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onClick={() => {
                                setEndLocation(suggestion);
                                setEndSuggestions([]);
                            }}
                            style={{ cursor: 'pointer', padding: '4px 8px' }}
                        >
                            {suggestion}
                        </li>
                    ))}
                </ul>
            )}
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
        </div>
    );
};

const ConnectedRouting = connect(
    null,
    {
        addLayer,
        removeLayer,
        zoomToExtent
    }
)(Routing);

export default createPlugin('Routing', {
    component: ConnectedRouting
});
