import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/support' })
export class SupportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {}
  handleDisconnect(client: Socket) {}

  @SubscribeMessage('join_ticket')
  handleJoin(@MessageBody() ticketId: string, @ConnectedSocket() client: Socket) {
    client.join(`ticket_${ticketId}`);
  }

  @SubscribeMessage('leave_ticket')
  handleLeave(@MessageBody() ticketId: string, @ConnectedSocket() client: Socket) {
    client.leave(`ticket_${ticketId}`);
  }

  @SubscribeMessage('typing_start')
  handleTypingStart(@MessageBody() data: { ticketId: string; role: string }, @ConnectedSocket() client: Socket) {
    client.to(`ticket_${data.ticketId}`).emit('typing_start', { role: data.role });
  }

  @SubscribeMessage('typing_stop')
  handleTypingStop(@MessageBody() data: { ticketId: string; role: string }, @ConnectedSocket() client: Socket) {
    client.to(`ticket_${data.ticketId}`).emit('typing_stop', { role: data.role });
  }

  emitNewMessage(ticketId: string, message: any) {
    this.server.to(`ticket_${ticketId}`).emit('new_message', message);
  }
}