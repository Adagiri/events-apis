const { combineResolvers } = require('graphql-resolvers');
const {
  getEvents,
  getEventById,
  getEventByIdForInvitedUsers,
  getEventByIdForInvitationLinks,
  generateInviteLinkId,
  createEvent,
  deleteEvent,
  toggleInviteLink,
  inviteUsers,
  acceptInvitation,
  rejectInvitation,
  removeInvitee,
  assignRoleToInvitee,
  addTodo,
  editTodo,
  deleteTodo,
  duplicateTodo,
  markTodo,
  editEvent,
  addRoutine,
  editRoutine,
  deleteRoutine,
  acceptInvitationViaInviteLink,
  rejectInvitationViaInviteLink,

} = require('../controllers/events');
const { protect, authorize } = require('../middleware/auth');
// event_acceptInvitationViaInviteLink("Id of the event" id: ID!): EventResponse!

// event_rejectInvitationViaInviteLink("Id of the event" id: ID!): EventResponse!
module.exports = {
  Query: {
    events: combineResolvers(protect, getEvents),
    event_getById: combineResolvers(protect, getEventById),
    event_getById_forInvitedUsers: combineResolvers(
      protect,
      getEventByIdForInvitedUsers
    ),
    event_generateInviteLinkId: combineResolvers(protect, generateInviteLinkId),
    event_getById_forInvitationLinks: combineResolvers(
      protect,
      getEventByIdForInvitationLinks
    ),
  },
  Mutation: {
    event_edit: combineResolvers(protect, editEvent),
    event_create: combineResolvers(protect, createEvent),
    event_delete: combineResolvers(protect, deleteEvent),
    event_toggleInviteLink: combineResolvers(protect, toggleInviteLink),
    event_inviteUsers: combineResolvers(protect, inviteUsers),
    event_acceptInvitation: combineResolvers(protect, acceptInvitation),
    event_rejectInvitation: combineResolvers(protect, rejectInvitation),
    event_acceptInvitationViaInviteLink: combineResolvers(
      protect,
      acceptInvitationViaInviteLink
    ),
    event_rejectInvitationViaInviteLink: combineResolvers(
      protect,
      rejectInvitationViaInviteLink
    ),

    event_removeInvitee: combineResolvers(protect, removeInvitee),
    event_assignRoleToInvitee: combineResolvers(protect, assignRoleToInvitee),
    event_addTodo: combineResolvers(protect, addTodo),
    event_editTodo: combineResolvers(protect, editTodo),
    event_deleteTodo: combineResolvers(protect, deleteTodo),
    event_duplicateTodo: combineResolvers(protect, duplicateTodo),
    event_markTodo: combineResolvers(protect, markTodo),

    event_addRoutine: combineResolvers(protect, addRoutine),
    event_editRoutine: combineResolvers(protect, editRoutine),
    event_deleteRoutine: combineResolvers(protect, deleteRoutine),
  },
};
