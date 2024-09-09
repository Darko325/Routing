export const HERE_API_KEY = 'xR3aaz-LsnU5pfO-VzjmD3Y2WGoigNkOKbw5Xapz7HY';

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

export const loadHereMapsAPI = async () => {
    try {
        await loadScript("https://js.api.here.com/v3/3.1/mapsjs-core.js");
        await loadScript("https://js.api.here.com/v3/3.1/mapsjs-service.js");
        await loadScript("https://js.api.here.com/v3/3.1/mapsjs-mapevents.js");
    } catch (error) {
        console.error('Failed to load HERE Maps API:', error);
    }
};