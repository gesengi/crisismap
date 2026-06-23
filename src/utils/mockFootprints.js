// Mock building footprints GeoJSON dataset for Nairobi, Kenya and Port-au-Prince, Haiti
// Coordinates are in [longitude, latitude] format for standard GeoJSON compatibility.

const staticFeatures = [
  // ─── NAIROBI BUILDINGS ──────────────────────────────────────────────────
  {
    type: "Feature",
    id: "building-nairobi-1",
    properties: {
      name: "Nairobi Town Hall",
      address: "City Hall Way, Nairobi, Kenya",
      city: "Nairobi",
      centroid: [-1.278, 36.818]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [36.8175, -1.2775],
          [36.8185, -1.2775],
          [36.8185, -1.2785],
          [36.8175, -1.2785],
          [36.8175, -1.2775]
        ]
      ]
    }
  },
  {
    type: "Feature",
    id: "building-nairobi-2",
    properties: {
      name: "Nairobi National Museum",
      address: "Kipande Rd, Nairobi, Kenya",
      city: "Nairobi",
      centroid: [-1.279, 36.822]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [36.8215, -1.2785],
          [36.8225, -1.2785],
          [36.8225, -1.2795],
          [36.8215, -1.2795],
          [36.8215, -1.2785]
        ]
      ]
    }
  },
  {
    type: "Feature",
    id: "building-nairobi-3",
    properties: {
      name: "Community Health Center",
      address: "Ngong Rd, Nairobi, Kenya",
      city: "Nairobi",
      centroid: [-1.282, 36.821]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [36.8205, -1.2815],
          [36.8215, -1.2815],
          [36.8215, -1.2825],
          [36.8205, -1.2825],
          [36.8205, -1.2815]
        ]
      ]
    }
  },
  
  // ─── PORT-AU-PRINCE BUILDINGS ──────────────────────────────────────────
  {
    type: "Feature",
    id: "building-haiti-1",
    properties: {
      name: "Port-au-Prince Cathedral",
      address: "Rue Monseigneur Guilloux, Port-au-Prince, Haiti",
      city: "Port-au-Prince",
      centroid: [18.538, -72.338]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-72.3385, 18.5375],
          [-72.3375, 18.5375],
          [-72.3375, 18.5385],
          [-72.3385, 18.5385],
          [-72.3385, 18.5375]
        ]
      ]
    }
  },
  {
    type: "Feature",
    id: "building-haiti-2",
    properties: {
      name: "St. Francois de Sales Hospital",
      address: "Rue Chareron, Port-au-Prince, Haiti",
      city: "Port-au-Prince",
      centroid: [18.542, -72.342]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-72.3425, 18.5415],
          [-72.3415, 18.5415],
          [-72.3415, 18.5425],
          [-72.3425, 18.5425],
          [-72.3425, 18.5415]
        ]
      ]
    }
  },
  {
    type: "Feature",
    id: "building-haiti-3",
    properties: {
      name: "National Palace Vetting Area",
      address: "Avenue de la Republique, Port-au-Prince, Haiti",
      city: "Port-au-Prince",
      centroid: [18.539, -72.345]
    },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-72.3455, 18.5385],
          [-72.3445, 18.5385],
          [-72.3445, 18.5395],
          [-72.3455, 18.5395],
          [-72.3455, 18.5385]
        ]
      ]
    }
  }
];

export const mockFootprints = {
  type: "FeatureCollection",
  features: staticFeatures
};

// Deterministic seedable random number generator
function srandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Generate building footprints in a grid cell (size 0.003 x 0.003 degrees, approx. 330m x 330m)
// This cell size creates a nice dense urban spacing
export function generateCellBuildings(gridX, gridY) {
  const buildings = [];
  const latBase = gridX * 0.003;
  const lngBase = gridY * 0.003;

  // Generate 3 buildings per cell to avoid cluttering but keep it dense
  for (let i = 0; i < 3; i++) {
    const seed = gridX * 100000 + gridY * 10 + i;
    
    const r1 = srandom(seed);
    const r2 = srandom(seed + 1);
    const r3 = srandom(seed + 2);
    const r4 = srandom(seed + 3);

    // Center of the building inside the grid cell
    const latOffset = 0.0004 + r1 * 0.0022;
    const lngOffset = 0.0004 + r2 * 0.0022;

    const bLat = latBase + latOffset;
    const bLng = lngBase + lngOffset;

    // Building dimensions (approx. 15-40 meters)
    const latSize = 0.0001 + r3 * 0.00015;
    const lngSize = 0.0001 + r4 * 0.00015;

    const names = ["Residence", "Clinic", "School", "Store", "Office", "Apartments", "Warehouse", "Market Stalls", "Community Hall", "Substation"];
    const nameType = names[Math.floor(r1 * names.length)];
    const name = `${nameType} #${Math.abs(gridX) % 100}${Math.abs(gridY) % 100}-${i}`;

    const building = {
      type: "Feature",
      id: `bld_${gridX}_${gridY}_${i}`,
      properties: {
        name: name,
        address: `Grid Sector ${gridX}, Zone ${gridY}`,
        city: "Dynamic Grid Zone",
        centroid: [bLat, bLng] // [latitude, longitude]
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [bLng - lngSize, bLat - latSize],
            [bLng + lngSize, bLat - latSize],
            [bLng + lngSize, bLat + latSize],
            [bLng - lngSize, bLat + latSize],
            [bLng - lngSize, bLat - latSize]
          ]
        ]
      }
    };
    buildings.push(building);
  }
  return buildings;
}

// Reconstruct a generated building by its ID
export function reconstructBuildingById(id) {
  if (!id || !id.startsWith('bld_')) return null;
  const parts = id.split('_');
  if (parts.length < 4) return null;
  const gridX = parseInt(parts[1], 10);
  const gridY = parseInt(parts[2], 10);
  const i = parseInt(parts[3], 10);
  if (isNaN(gridX) || isNaN(gridY) || isNaN(i)) return null;
  const buildings = generateCellBuildings(gridX, gridY);
  return buildings[i] || null;
}

// Find building by ID (checks static first, then dynamic)
export function findBuildingById(id) {
  if (!id) return null;
  const staticB = staticFeatures.find(f => f.id === id);
  if (staticB) return staticB;
  return reconstructBuildingById(id);
}

// Get all footprints around a specific latitude and longitude (e.g. 5x5 grid cells around the point)
export function getFootprintsAround(lat, lng) {
  const gridXCenter = Math.floor(lat / 0.003);
  const gridYCenter = Math.floor(lng / 0.003);

  const features = [];
  
  // Add static features (always display them in case map centers near Nairobi or Haiti)
  features.push(...staticFeatures);

  // Generate buildings for a 5x5 grid cell area around the center
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const gx = gridXCenter + dx;
      const gy = gridYCenter + dy;
      features.push(...generateCellBuildings(gx, gy));
    }
  }

  return {
    type: "FeatureCollection",
    features: features
  };
}

// Get region classification for a report (e.g. Nairobi, Port-au-Prince, etc.)
export function getReportRegion(report) {
  if (!report) return 'Other';
  if (report.buildingId) {
    const building = findBuildingById(report.buildingId);
    if (building && building.properties.city && building.properties.city !== "Dynamic Grid Zone") {
      return building.properties.city;
    }
  }
  
  const addr = (report.address || '').toLowerCase();
  if (addr.includes('nairobi') || addr.includes('kenya')) return 'Nairobi';
  if (addr.includes('port-au-prince') || addr.includes('haiti')) return 'Port-au-Prince';
  if (addr.includes('istanbul') || addr.includes('turkey') || addr.includes('türkiye')) return 'Istanbul';
  if (addr.includes('manila') || addr.includes('philippines')) return 'Manila';
  if (addr.includes('mexico') || addr.includes('méxico')) return 'Mexico City';
  if (addr.includes('beirut') || addr.includes('lebanon')) return 'Beirut';

  // Fallback based on coordinates if address is empty
  const lat = report.latitude;
  const lng = report.longitude;
  if (lat && lng) {
    if (lat > -1.5 && lat < -1.1 && lng > 36.6 && lng < 37.0) return 'Nairobi';
    if (lat > 18.3 && lat < 18.7 && lng > -72.5 && lng < -72.1) return 'Port-au-Prince';
    if (lat > 33.7 && lat < 34.1 && lng > 35.3 && lng < 35.7) return 'Beirut';
    if (lat > 40.8 && lat < 41.2 && lng > 28.7 && lng < 29.2) return 'Istanbul';
    if (lat > 14.4 && lat < 14.8 && lng > 120.7 && lng < 121.1) return 'Manila';
    if (lat > 19.2 && lat < 19.6 && lng > -99.3 && lng < -98.9) return 'Mexico City';
  }

  return 'Other';
}
