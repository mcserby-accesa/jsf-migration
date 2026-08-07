Feature: Leave request detail submission
  A user viewing the leave request detail screen enters a start date, an
  end date, and optionally marks the request as half-day, then submits.
  Depending on whether the dates are valid, the request is either saved
  with status PENDING_MANAGER_APPROVAL and the user is taken to a
  confirmation screen, or a validation error is shown and nothing is saved.
  # source: BHV-0142, taxonomy: screen
  # BHV-0142-S02 has no Scenario here: its decision_table_ref
  # (DT-BHV-0142-01) means it's covered by the Scenario Outline below, not
  # rendered independently — see templates/renderers/gherkin.md.

  @BHV-0142-S01
  Scenario: startDate is before endDate
    Given startDate is before endDate
    When the user submits the leave request form
    Then the request is saved with status PENDING_MANAGER_APPROVAL and the user is navigated to the confirmation screen
    # legacy_refs: LeaveRequestBean.java:40-52

  @BHV-0142-S03
  Scenario: startDate equals endDate and the half-day flag is not set
    Given startDate equals endDate and the half-day flag is not set
    When the user submits the leave request form
    Then a validation error about the half-day flag is shown and the request is not saved
    # legacy_refs: LeaveRequestBean.java:47

  @DT-BHV-0142-01
  Scenario Outline: start/end date ordering check
    Given start_after_end is <start_after_end>
    And start_equal_end is <start_equal_end>
    When the rule is evaluated
    Then the outcome is <expected_outcome>
    # legacy_refs: LeaveRequestBean.java:41-52

    Examples:
      | start_after_end | start_equal_end | expected_outcome                    |
      | true             | false            | validation error shown, not saved  |
      | false            | true             | validation error shown, not saved  |
      | false            | false            | request proceeds to save           |
