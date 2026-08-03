import { Image, StyleSheet, Text, View } from 'react-native';

import type {
  DeliveryOrder,
  ServerDeliveryRouteGeometry,
} from '../../domain/delivery/deliveryPlan';
import { DeliveryRouteMap } from './DeliveryRouteMap';

const DESTINATION_PIN_IMAGE = require('../../../assets/map/destination-pin.png') as number;

type DeliveryMapScreenProps = {
  orders: DeliveryOrder[];
  serverRouteGeometry: ServerDeliveryRouteGeometry | null;
};

export function DeliveryMapScreen({
  orders,
  serverRouteGeometry,
}: DeliveryMapScreenProps) {
  const destinationCount = new Set(
    orders.map(({ destinationId }) => destinationId),
  ).size;

  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>배송지 순서 미리보기</Text>
        <Text style={styles.title}>지도</Text>
        <Text style={styles.description}>
          {serverRouteGeometry === null
            ? '배송지 위치만 표시합니다. 서버 경로가 오면 그대로 반영합니다.'
            : '서버가 생성한 경로 geometry를 그대로 표시합니다.'}
        </Text>
      </View>

      <View style={styles.mapCard}>
        <DeliveryRouteMap
          interactionMode="explore"
          orders={orders}
          serverRouteGeometry={serverRouteGeometry}
          style={styles.map}
        />
        <View pointerEvents="none" style={styles.mapLegend}>
          <View style={styles.legendMarker}>
            <Image source={DESTINATION_PIN_IMAGE} style={styles.legendMarkerImage} />
            <Text style={styles.legendMarkerText}>1</Text>
          </View>
          <View style={styles.legendCopy}>
            <Text style={styles.legendTitle}>
              주문 {orders.length}건 · 배송지 {destinationCount}곳
            </Text>
            <Text style={styles.legendText}>표식 안 숫자는 배송지 방문 순서</Text>
          </View>
        </View>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerTitle}>
          {serverRouteGeometry === null
            ? '서버 경로를 기다리고 있습니다'
            : '서버 경로 표시 중'}
        </Text>
        <Text style={styles.disclaimerText}>
          {serverRouteGeometry === null
            ? 'DSV 서버 geometry가 없어 경로 선을 표시하지 않습니다. 앱은 배송지 사이를 임의로 연결하지 않습니다.'
            : 'DSV 서버가 OSRM/VWorld로 생성해 응답한 geometry를 수정 없이 표시합니다.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 14,
    paddingBottom: 16,
    paddingHorizontal: 18,
    paddingTop: 22,
  },
  heading: {
    gap: 4,
  },
  eyebrow: {
    color: '#0b57d0',
    fontSize: 13,
    fontWeight: '800',
  },
  title: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '900',
  },
  description: {
    color: '#667085',
    fontSize: 13,
    lineHeight: 19,
  },
  mapCard: {
    backgroundColor: '#e8eef7',
    borderColor: '#d0d5dd',
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    minHeight: 340,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapLegend: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 13,
    bottom: 14,
    elevation: 4,
    flexDirection: 'row',
    gap: 10,
    left: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
  },
  legendMarker: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 31,
  },
  legendMarkerImage: {
    height: 40,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 31,
  },
  legendMarkerText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    position: 'absolute',
    top: 6,
  },
  legendCopy: {
    gap: 1,
  },
  legendTitle: {
    color: '#344054',
    fontSize: 12,
    fontWeight: '800',
  },
  legendText: {
    color: '#667085',
    fontSize: 10,
  },
  disclaimer: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 13,
  },
  disclaimerTitle: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '800',
  },
  disclaimerText: {
    color: '#667085',
    fontSize: 11,
    lineHeight: 17,
  },
});
