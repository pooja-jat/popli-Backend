import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/feed-admin' })
export class FeedGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private jwtService: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) throw new Error('No token');
      const decoded = this.jwtService.verify(token, { secret: process.env.JWT_SECRET });
      client.data.user = decoded;
      client.join('feed_admin_room');
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {}

  emitBoostCreated(boost: any) {
    this.server.to('feed_admin_room').emit('boost_created', boost);
  }

  emitBoostUpdated(boost: any) {
    this.server.to('feed_admin_room').emit('boost_updated', boost);
  }

  emitBoostDeleted(boostId: string) {
    this.server.to('feed_admin_room').emit('boost_deleted', { id: boostId });
  }

  emitConfigUpdated(config: any) {
    this.server.to('feed_admin_room').emit('config_updated', config);
  }

  emitMetricsUpdated(metrics: any) {
    this.server.to('feed_admin_room').emit('metrics_updated', metrics);
  }
}