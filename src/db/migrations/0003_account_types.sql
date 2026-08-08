UPDATE `accounts`
SET `type` = CASE
  WHEN `type` = 'cash' THEN 'cash'
  WHEN `type` = 'bank' THEN 'bank'
  WHEN `type` = 'digital_wallet' THEN 'digital_wallet'
  WHEN `type` = 'stored_value_card' THEN 'stored_value_card'
  WHEN `type` = 'credit_card' THEN 'credit_card'
  WHEN `type` = 'online_credit' THEN 'online_credit'
  WHEN `type` = 'investment' THEN 'investment'
  WHEN `type` = 'long_term_asset' THEN 'long_term_asset'
  WHEN `type` = 'other' THEN 'other'
  WHEN `type` = 'credit' THEN 'credit_card'
  ELSE 'other'
END;
