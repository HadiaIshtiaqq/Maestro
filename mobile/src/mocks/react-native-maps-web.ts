import React from 'react';
import { View } from 'react-native';

const Noop = () => null;
const NoopView = ({ children, style }: any) => React.createElement(View, { style }, children);

export default NoopView;
export const Marker    = Noop;
export const Circle    = Noop;
export const Polyline  = Noop;
export const Callout   = Noop;
export const Polygon   = Noop;
export const PROVIDER_GOOGLE = 'google';
export const MapView   = NoopView;
