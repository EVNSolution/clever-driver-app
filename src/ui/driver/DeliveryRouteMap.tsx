import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  LocationManager,
  Map as MapLibreMap,
  UserLocation,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  buildDeliveryRouteVisualState,
  type DeliveryCoordinate,
  type DeliveryOrder,
  type DeliveryRouteMarkerState,
  type ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';

const DESTINATION_PIN_IMAGE = require('../../../assets/map/destination-pin.png') as number;
const DEPOT_PIN_IMAGE = require('../../../assets/map/depot-pin.png') as number;
const COMPLETED_MAP_COLOR = '#98a2b3';

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
  'icon-color': [
    'case',
    ['==', ['get', 'markerState'], 'current'], '#12b76a',
    ['==', ['get', 'markerState'], 'completed'], COMPLETED_MAP_COLOR,
    '#0b57d0',
  ],
  'icon-halo-color': '#ffffff',
  'icon-halo-width': 1,
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
  currentDeliveryStopId?: string | null;
  depotCoordinate?: DeliveryCoordinate | null;
  interactionMode: 'explore' | 'pan-only';
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
  style?: StyleProp<ViewStyle>;
};

type MapLoadState = 'loading' | 'ready' | 'error';
type LocationPermission = 'idle' | 'requesting' | 'granted' | 'denied';

export function DeliveryRouteMap({
  currentDeliveryStopId = null,
  depotCoordinate = null,
  interactionMode,
  orders,
  serverRouteGeometry,
  style,
}: DeliveryRouteMapProps) {
  const canExplore = interactionMode === 'explore';
  const [mapLoadState, setMapLoadState] = useState<MapLoadState>('loading');
  const [locationPermission, setLocationPermission] =
    useState<LocationPermission>(canExplore ? 'requesting' : 'idle');
  const mapModel = useMemo(
    () => buildDeliveryMapModel(
      orders,
      serverRouteGeometry,
      depotCoordinate,
      currentDeliveryStopId,
    ),
    [currentDeliveryStopId, depotCoordinate, orders, serverRouteGeometry],
  );

  useEffect(() => {
    if (!canExplore || locationPermission !== 'requesting') return undefined;

    let isActive = true;
    void LocationManager.requestPermissions()
      .then((granted) => {
        if (isActive) setLocationPermission(granted ? 'granted' : 'denied');
      })
      .catch(() => {
        if (isActive) setLocationPermission('denied');
      });
    return () => {
      isActive = false;
    };
  }, [canExplore, locationPermission]);

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
            'delivery-destination-pin-image': {
              sdf: true,
              source: DESTINATION_PIN_IMAGE,
            },
          }}
        />
        {mapModel.upcomingGeometry !== null ? (
          <GeoJSONSource
            data={mapModel.upcomingGeometry}
            id="delivery-server-route-source"
          >
            <Layer
              id="delivery-server-route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#0b57d0',
                'line-opacity': 0.9,
                'line-width': 4,
              }}
              source="delivery-server-route-source"
              type="line"
            />
          </GeoJSONSource>
        ) : null}
        {mapModel.completedGeometry !== null ? (
          <GeoJSONSource
            data={mapModel.completedGeometry}
            id="delivery-completed-route-source"
          >
            <Layer
              id="delivery-completed-route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': COMPLETED_MAP_COLOR,
                'line-opacity': 0.72,
                'line-width': 4,
              }}
              source="delivery-completed-route-source"
              type="line"
            />
          </GeoJSONSource>
        ) : null}
        {mapModel.currentGeometry !== null ? (
          <GeoJSONSource
            data={mapModel.currentGeometry}
            id="delivery-current-route-source"
          >
            <Layer
              id="delivery-current-route-line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#12b76a',
                'line-opacity': 1,
                'line-width': 4.5,
              }}
              source="delivery-current-route-source"
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
        {canExplore && locationPermission === 'granted' ? (
          <UserLocation animated accuracy heading minDisplacement={5} />
        ) : null}
      </MapLibreMap>

      {canExplore && locationPermission !== 'granted' ? (
        <Pressable
          accessibilityRole="button"
          disabled={locationPermission === 'requesting'}
          onPress={() => setLocationPermission('requesting')}
          style={styles.locationPermissionButton}
        >
          <View style={styles.locationPermissionDot} />
          <Text style={styles.locationPermissionText}>
            {locationPermission === 'requesting'
              ? '내 위치 확인 중'
              : '내 위치 권한 허용'}
          </Text>
        </Pressable>
      ) : null}

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
  currentDeliveryStopId: string | null,
): {
  bounds: [number, number, number, number];
  completedGeometry: ServerDeliveryRouteGeometry | null;
  currentGeometry: ServerDeliveryRouteGeometry | null;
  depot: GeoJSON.Feature<GeoJSON.Point> | null;
  markers: GeoJSON.FeatureCollection<
    GeoJSON.Point,
    {
      destinationId: string;
      label: string;
      markerState: DeliveryRouteMarkerState;
      sortKey: number;
    }
  >;
  upcomingGeometry: ServerDeliveryRouteGeometry | null;
} {
  const visualState = buildDeliveryRouteVisualState(
    orders,
    serverRouteGeometry,
    currentDeliveryStopId,
  );
  const points = visualState.markers;
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
    completedGeometry: visualState.completedGeometry,
    currentGeometry: visualState.currentGeometry,
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
          markerState: point.markerState,
          sortKey: -point.sortOrder,
        },
      })),
    },
    upcomingGeometry: visualState.upcomingGeometry,
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
  locationPermissionButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: '#d0d5dd',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 12,
    shadowColor: '#101828',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    top: 12,
  },
  locationPermissionDot: {
    backgroundColor: '#33b5e5',
    borderColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    width: 12,
  },
  locationPermissionText: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '700',
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
