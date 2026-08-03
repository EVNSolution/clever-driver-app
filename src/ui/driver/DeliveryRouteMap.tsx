import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapLibreMap,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  buildDeliveryDestinationPoints,
  type DeliveryCoordinate,
  type DeliveryOrder,
  type ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';

const DESTINATION_PIN_IMAGE = require('../../../assets/map/destination-pin.png') as number;
const DEPOT_PIN_IMAGE = require('../../../assets/map/depot-pin.png') as number;

const DESTINATION_MARKER_LAYOUT = {
  'icon-allow-overlap': true,
  'icon-anchor': 'bottom',
  'icon-ignore-placement': true,
  'icon-image': 'delivery-destination-pin-image',
  'icon-optional': false,
  'icon-size': 0.62,
  'symbol-sort-key': ['get', 'sortKey'],
  'text-allow-overlap': true,
  'text-anchor': 'center',
  'text-field': ['get', 'label'],
  'text-font': ['Noto Sans Bold'],
  'text-ignore-placement': true,
  'text-offset': [0, -2],
  'text-optional': false,
  'text-size': 10,
} satisfies SymbolLayerSpecification['layout'];

const DESTINATION_MARKER_PAINT = {
  'text-color': '#ffffff',
  'text-halo-color': 'rgba(0, 0, 0, 0.32)',
  'text-halo-width': 0.6,
} satisfies SymbolLayerSpecification['paint'];

const DEPOT_MARKER_LAYOUT = {
  'icon-allow-overlap': true,
  'icon-anchor': 'bottom',
  'icon-ignore-placement': true,
  'icon-image': 'delivery-depot-pin-image',
  'icon-optional': false,
  'icon-size': 0.65,
  'symbol-sort-key': 5000,
} satisfies SymbolLayerSpecification['layout'];

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_PADDING = { bottom: 44, left: 34, right: 34, top: 44 } as const;
const FALLBACK_BOUNDS = [126.91, 37.48, 127.16, 37.66] as const;

type DeliveryRouteMapProps = {
  depotCoordinate?: DeliveryCoordinate | null;
  interactionMode: 'explore' | 'pan-only';
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  style?: StyleProp<ViewStyle>;
};

type MapLoadState = 'loading' | 'ready' | 'error';

export function DeliveryRouteMap({
  depotCoordinate = null,
  interactionMode,
  orders,
  serverRouteGeometry,
  style,
}: DeliveryRouteMapProps) {
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>('loading');
  const mapModel = useMemo(
    () => buildDeliveryMapModel(orders, serverRouteGeometry, depotCoordinate),
    [depotCoordinate, orders, serverRouteGeometry],
  );
  const canExplore = interactionMode === 'explore';

  return (
    <View style={[styles.container, style]}>
      <MapLibreMap
        androidView="texture"
        attribution={false}
        compass={false}
        dragPan
        logo={false}
        mapStyle={MAP_STYLE_URL}
        onDidFailLoadingMap={() => setMapLoadState('error')}
        onDidFinishLoadingStyle={() => setMapLoadState('ready')}
        scaleBar={false}
        style={styles.map}
        touchPitch={false}
        touchRotate={false}
        touchZoom={canExplore}
      >
        <Camera
          initialViewState={{ bounds: mapModel.bounds, padding: MAP_PADDING }}
          maxZoom={17}
          minZoom={4}
        />
        <Images
          images={{
            'delivery-depot-pin-image': DEPOT_PIN_IMAGE,
            'delivery-destination-pin-image': DESTINATION_PIN_IMAGE,
          }}
        />
        {serverRouteGeometry !== null ? (
          <GeoJSONSource
            data={serverRouteGeometry}
            id="delivery-server-route-source"
          >
            <Layer
              id="delivery-server-route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#079455',
                'line-opacity': 0.9,
                'line-width': 4,
              }}
              source="delivery-server-route-source"
              type="line"
            />
          </GeoJSONSource>
        ) : null}
        <GeoJSONSource data={mapModel.markers} id="delivery-marker-source">
          <Layer
            id="delivery-destination-marker"
            layout={DESTINATION_MARKER_LAYOUT}
            paint={DESTINATION_MARKER_PAINT}
            source="delivery-marker-source"
            type="symbol"
          />
        </GeoJSONSource>
        {mapModel.depot === null ? null : (
          <GeoJSONSource data={mapModel.depot} id="delivery-depot-source">
            <Layer
              id="delivery-depot-marker"
              layout={DEPOT_MARKER_LAYOUT}
              source="delivery-depot-source"
              type="symbol"
            />
          </GeoJSONSource>
        )}
      </MapLibreMap>

      {mapLoadState !== 'ready' ? (
        <View pointerEvents="none" style={styles.mapStateOverlay}>
          <Text style={styles.mapStateTitle}>
            {mapLoadState === 'error'
              ? '지도를 불러오지 못했습니다.'
              : '지도를 불러오는 중입니다.'}
          </Text>
          <Text style={styles.mapStateText}>
            {mapLoadState === 'error'
              ? '주문 순서는 아래 목록에서 계속 편집할 수 있습니다.'
              : 'MapLibre 지도를 준비하고 있습니다.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function buildDeliveryMapModel(
  orders: DeliveryOrder[],
  serverRouteGeometry: ServerDeliveryRouteGeometry | null,
  depotCoordinate: DeliveryCoordinate | null,
): {
  bounds: [number, number, number, number];
  depot: GeoJSON.Feature<GeoJSON.Point> | null;
  markers: GeoJSON.FeatureCollection<
    GeoJSON.Point,
    { destinationId: string; label: string; sortKey: number }
  >;
} {
  const points = buildDeliveryDestinationPoints(orders);
  const visibleCoordinates = [
    ...(depotCoordinate === null
      ? []
      : [[
          depotCoordinate.longitude,
          depotCoordinate.latitude,
        ] as [longitude: number, latitude: number]]),
    ...points.map(({ coordinate }) => coordinate),
    ...(serverRouteGeometry?.coordinates ?? []),
  ];
  const bounds = readBounds(visibleCoordinates);

  return {
    bounds,
    depot:
      depotCoordinate === null
        ? null
        : {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [depotCoordinate.longitude, depotCoordinate.latitude],
            },
            properties: {},
          },
    markers: {
      type: 'FeatureCollection',
      features: points.map((point) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point.coordinate,
        },
        properties: {
          destinationId: point.destinationId,
          label: point.label,
          sortKey: -point.sortOrder,
        },
      })),
    },
  };
}

function readBounds(
  coordinates: [longitude: number, latitude: number][],
): [number, number, number, number] {
  if (coordinates.length === 0) {
    return [...FALLBACK_BOUNDS];
  }

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);

  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#e8eef7',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapStateOverlay: {
    alignItems: 'center',
    backgroundColor: '#eef4ff',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: 20,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  mapStateTitle: {
    color: '#1d2939',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  mapStateText: {
    color: '#667085',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
    textAlign: 'center',
  },
});
