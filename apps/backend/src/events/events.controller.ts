import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Headers,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { AuthGuard } from '@nestjs/passport';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BookingQueueService } from '../booking/booking-queue.service';
import { BookingStatusService } from '../booking/booking-status.service';

@ApiTags('Events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly bookingQueue: BookingQueueService,
    private readonly bookingStatus: BookingStatusService,
  ) { }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Create a new event' })
  @ApiResponse({ status: 201, description: 'Event created successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or date in the past.',
  })
  async create(
    @Body() createEventDto: CreateEventDto,
    @GetUser('id') userId: string,
  ) {
    return await this.eventsService.create(createEventDto, userId);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get all public events' })
  @ApiResponse({ status: 200, description: 'Return list of public events.' })
  async findAll(
    @GetUser('id') userId: string | undefined,
    @Query() paginationDto: PaginationDto,
  ) {
    return await this.eventsService.findAll(userId, paginationDto);
  }

  @Get('me/calendar')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get current user calendar' })
  async getMyCalendar(@GetUser('id') userId: string) {
    return await this.eventsService.findMyCalendar(userId);
  }

  @Get('join-requests/:requestId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Poll the status of a queued join request' })
  @ApiResponse({ status: 200, description: 'PENDING, CONFIRMED or REJECTED.' })
  @ApiResponse({ status: 404, description: 'Unknown or expired request ID.' })
  async getJoinRequestStatus(
    @Param('requestId') requestId: string,
    @GetUser('id') userId: string,
  ) {
    const status = await this.bookingStatus.getStatus(requestId);
    // 404 (not 403) for someone else's request — don't confirm it exists.
    if (!status || status.userId !== userId) {
      throw new NotFoundException('Unknown or expired join request');
    }
    return status;
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get event details by ID' })
  async findOne(@Param('id') id: string, @GetUser('id') userId?: string) {
    return await this.eventsService.findOne(id, userId);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Update an event' })
  @ApiResponse({ status: 200, description: 'Event updated successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: You are not the author.',
  })
  async update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @GetUser('id') userId: string,
  ) {
    return await this.eventsService.update(id, userId, updateEventDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete an event' })
  async remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.eventsService.remove(id, userId);
  }

  @Post(':id/join')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(202)
  @ApiOperation({
    summary: 'Request to join an event (queued, asynchronous)',
  })
  @ApiResponse({
    status: 202,
    description:
      'Request accepted and queued. Poll GET /events/join-requests/:requestId for the outcome. ' +
      'Send an `Idempotency-Key` header to make a retry or double-submit reuse the same request.',
  })
  async join(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      throw new BadRequestException('Idempotency-Key must be 8–200 characters');
    }
    const requestId = await this.bookingQueue.enqueueJoin(id, userId, idempotencyKey);
    return {
      requestId,
      statusUrl: `/events/join-requests/${requestId}`,
    };
  }

  @Post(':id/leave')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Leave an event' })
  @ApiResponse({ status: 200, description: 'Successfully left.' })
  @ApiResponse({ status: 403, description: 'The organizer cannot leave their own event.' })
  @ApiResponse({ status: 404, description: 'Event not found.' })
  @ApiResponse({ status: 409, description: 'User is not a participant.' })
  async leave(@Param('id') id: string, @GetUser('id') userId: string) {
    return await this.eventsService.leaveEvent(id, userId);
  }
}
