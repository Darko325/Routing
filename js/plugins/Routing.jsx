import React, { useState } from 'react';
import { connect } from 'react-redux';
import { createPlugin } from '@mapstore/utils/PluginsUtils';
import { addLayer, removeLayer } from '@mapstore/actions/layers';
import { zoomToExtent } from '@mapstore/actions/map';

const Routing = ({ addLayer, removeLayer, zoomToExtent }) => {
    const [startLocation, setStartLocation] = useState('');
    const [endLocation, setEndLocation] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);

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

            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${endCoords.lon},${endCoords.lat}?overview=full&geometries=geojson`);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                drawRoute(route.geometry.coordinates, startCoords, endCoords);

                const distance = route.distance / 1000; // Convert to km
                const duration = route.duration / 60; // Convert to minutes
                setError(`Route found! Distance: ${distance.toFixed(2)} km, Duration: ${duration.toFixed(0)} minutes`);
            } else {
                setError('No routes found.');
            }
        } catch (error) {
            console.error('Error drawing route:', error);
            setError(`Unable to draw route. ${error.message}`);
        } finally {
            setIsSearching(false);
        }
    };

    const drawRoute = (coordinates, startCoords, endCoords) => {
        // Remove existing route layer if any
        removeLayer('routeLayer');

        // Create a GeoJSON feature for the route
        const routeFeature = {
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: coordinates
            }
        };

        // Create GeoJSON features for start and end points
        const startFeature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [startCoords.lon, startCoords.lat]
            }
        };

        const endFeature = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [endCoords.lon, endCoords.lat]
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
        const bounds = getBounds(coordinates);
        zoomToExtent(bounds, 'EPSG:4326');
    };

    const getBounds = (coordinates) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coordinates.forEach(([x, y]) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });
        return [minX, minY, maxX, maxY];
    };

    const geocodeLocation = async (location) => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`);
            const data = await response.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            } else {
                throw new Error(`Location not found: ${location}`);
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            throw new Error(`Failed to geocode location: ${location}`);
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
                placeholder="Start location"
                className="form-control"
                style={{ marginBottom: '8px' }}
            />
            <input
                type="text"
                value={endLocation}
                onChange={(e) => setEndLocation(e.target.value)}
                placeholder="End location"
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