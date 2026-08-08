/** Rendered from BHV-0142. Do not hand-edit — re-render from the BHV instead. */
/** legacy_test_seam: service (framework.yaml) */
/** BHV-0142-S02 has no method here: its decision_table_ref (DT-BHV-0142-01)
  * means it's covered by DT_BHV_0142_01_startEndDateOrderingCheck below, not
  * rendered independently — see templates/renderers/junit.md. */
class BHV0142LeaveRequestDetailSubmissionTest {

    // legacy_refs: LeaveRequestBean.java:40-52
    // surface: rest POST /api/v1/leave-requests (leave_requests_create)
    @Test
    @DisplayName("BHV-0142-S01 — the request is saved with status PENDING_MANAGER_APPROVAL and the user is navigated to the confirmation screen")
    void BHV_0142_S01_requestIsSavedAndNavigatesToConfirmation() {
        // Given: startDate is before endDate
        LeaveRequestBean bean = newBeanWith(startDate("2026-06-10"), endDate("2026-06-12"));

        // When: the user submits the leave request form
        bean.submit();

        // Then: the request is saved with status PENDING_MANAGER_APPROVAL
        // and the user is navigated to the confirmation screen
        assertThat(bean.getRequest().getStatus()).isEqualTo(Status.PENDING_MANAGER_APPROVAL);
        assertThat(bean.getLastNavigationOutcome()).isEqualTo("confirmation");
    }

    // legacy_refs: LeaveRequestBean.java:47
    // surface: rest POST /api/v1/leave-requests (leave_requests_create), 400
    @Test
    @DisplayName("BHV-0142-S03 — a validation error about the half-day flag is shown and the request is not saved")
    void BHV_0142_S03_singleDayWithoutHalfDayFlagShowsValidationError() {
        // Given: startDate equals endDate and the half-day flag is not set
        LeaveRequestBean bean = newBeanWith(startDate("2026-06-10"), endDate("2026-06-10"), halfDay(false));

        // When: the user submits the leave request form
        bean.submit();

        // Then: a validation error about the half-day flag is shown and the request is not saved
        assertThat(bean.getErrors()).contains("Single-day requests require the half-day flag");
        assertThat(bean.isSaved()).isFalse();
    }

    // legacy_refs: LeaveRequestBean.java:41-52
    // surface: rest POST /api/v1/leave-requests (leave_requests_create)
    @ParameterizedTest
    @DisplayName("DT-BHV-0142-01 — start/end date ordering check")
    @CsvSource({
        "true,  false, VALIDATION_ERROR",
        "false, true,  VALIDATION_ERROR",
        "false, false, SAVED"
    })
    void DT_BHV_0142_01_startEndDateOrderingCheck(boolean startAfterEnd, boolean startEqualEnd, Outcome expectedOutcome) {
        LeaveRequestBean bean = newBeanWithOrdering(startAfterEnd, startEqualEnd);

        bean.submit();

        assertThat(bean.getOutcome()).isEqualTo(expectedOutcome);
    }
}
