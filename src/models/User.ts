import mongoose, { Schema, Document } from 'mongoose';

export interface IEmergencyContact {
  name:               string;
  phone:              string;
  email:              string;        // for Gmail alerts
  relationship:       string;
  notifyViaWhatsapp:  boolean;
  notifyViaEmail:     boolean;
}

export interface IUser extends Document {
  name:             string;
  phone:            string;
  email:            string;
  passwordHash:     string;
  location: {
    lat:     number;
    lng:     number;
    address: string;
  };
  alertRadiusKm:    number;
  emergencyContact: IEmergencyContact | null;
  pushToken:        string | null;
  createdAt:        Date;
  updatedAt:        Date;
}

const EmergencyContactSchema = new Schema({
  name:              { type: String, required: true },
  phone:             { type: String, required: true },
  email:             { type: String, default: '' },
  relationship:      { type: String, default: 'Other' },
  notifyViaWhatsapp: { type: Boolean, default: true },
  notifyViaEmail:    { type: Boolean, default: true },
}, { _id: false });

const UserSchema: Schema = new Schema({
  name:         { type: String, required: true },
  phone:        { type: String, required: true, unique: true },
  email:        { type: String, default: '' },
  passwordHash: { type: String, required: true },
  location: {
    lat:     { type: Number, required: true },
    lng:     { type: Number, required: true },
    address: { type: String, default: '' },
  },
  alertRadiusKm:    { type: Number, default: 15 },
  emergencyContact: { type: EmergencyContactSchema, default: null },
  pushToken:        { type: String, default: null },
}, { timestamps: true });

UserSchema.index({ 'location.lat': 1, 'location.lng': 1 });

export const User = mongoose.model<IUser>('User', UserSchema);
