import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type CircleLayerSpecification,
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

import type {
  DeliveryOrder,
  ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_PADDING = { bottom: 44, left: 34, right: 34, top: 44 } as const;
const FALLBACK_BOUNDS = [126.91, 37.48, 127.16, 37.66] as const;

const MARKER_PAINT = {
  'circle-color': '#0b57d0',
  'circle-radius': 20,
  'circle-stroke-color': '#ffffff',
  'circle-stroke-width': 3,
} satisfies CircleLayerSpecification['paint'];

const MARKER_LABEL_LAYOUT = {
  'text-allow-overlap': true,
  'text-field': ['get', 'label'],
  'text-font': ['Noto Sans Bold'],
  'text-ignore-placement': true,
  'text-size': 10,
} satisfies SymbolLayerSpecification['layout'];

const MARKER_LABEL_PAINT = {
  'text-color': '#ffffff',
} satisfies SymbolLayerSpecification['paint'];

type DeliveryRouteMapProps = {
  interactionMode: 'explore' | 'pan-only';
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  style?: StyleProp<ViewStyle>;
};

type MapLoadState = 'loading' | 'ready' | 'error';

export function DeliveryRouteMap({
  interactionMode,
  orders,
  serverRouteGeometry,
  style,
}: DeliveryRouteMapProps) {
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>('loading');
  const mapModel = useMemo(
    () => buildDeliveryMapModel(orders, serverRouteGeometry),
    [orders, serverRouteGeometry],
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
            id="delivery-marker-circle"
            paint={MARKER_PAINT}
            source="delivery-marker-source"
            type="circle"
          />
          <Layer
            id="delivery-marker-label"
            layout={MARKER_LABEL_LAYOUT}
            paint={MARKER_LABEL_PAINT}
            source="delivery-marker-source"
            type="symbol"
          />
        </GeoJSONSource>
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
): {
  bounds: [number, number, number, number];
  markers: GeoJSON.FeatureCollection<GeoJSON.Point, { label: string }>;
} {
  const destinationPoints = new globalThis.Map<
    string,
    {
      coordinate: [longitude: number, latitude: number];
      sequences: number[];
    }
  >();

  for (const order of orders) {
    const point = destinationPoints.get(order.destinationId);

    if (point === undefined) {
      destinationPoints.set(order.destinationId, {
        coordinate: [order.coordinate.longitude, order.coordinate.latitude],
        sequences: [order.sequence],
      });
      continue;
    }

    point.sequences.push(order.sequence);
  }

  const points = [...destinationPoints.values()];
  const visibleCoordinates = [
    ...points.map(({ coordinate }) => coordinate),
    ...(serverRouteGeometry?.coordinates ?? []),
  ];
  const bounds = readBounds(visibleCoordinates);

  return {
    bounds,
    markers: {
      type: 'FeatureCollection',
      features: points.map((point) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: point.coordinate,
        },
        properties: { label: point.sequences.join('·') },
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
